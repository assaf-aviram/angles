"""
Bike-fit knee-angle tracker — proof of concept.

Feeds a side-on cycling video through MediaPipe's PoseLandmarker (Tasks API),
computes the knee angle (hip-knee-ankle) on the camera-facing leg for every
frame, smooths it, splits it into pedal strokes, and reports the
flexion/extension range a fitter cares about.

Usage:
    python bike_angle_track.py path/to/video.mov
    python bike_angle_track.py video.mov --side right --joint knee --plot out.png

Install:
    pip install -r requirements.txt
The pose model (~9 MB) downloads automatically on first run.
"""

import argparse
import csv
import math
import os
import urllib.request

os.environ.setdefault("GLOG_minloglevel", "2")  # silence MediaPipe/GLog noise

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
from scipy.signal import find_peaks

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task"
)
MODEL_PATH = "pose_landmarker_heavy.task"

# BlazePose 33-landmark indices (same in legacy and Tasks API).
IDX = {
    "SHOULDER": (11, 12), "ELBOW": (13, 14), "WRIST": (15, 16),
    "HIP": (23, 24), "KNEE": (25, 26), "ANKLE": (27, 28),
    "FOOT_INDEX": (31, 32),
}
SIDE_COL = {"LEFT": 0, "RIGHT": 1}

# The three landmarks forming each tracked angle.
JOINTS = {
    "knee": ("HIP", "KNEE", "ANKLE"),
    "hip": ("SHOULDER", "HIP", "KNEE"),
    "elbow": ("SHOULDER", "ELBOW", "WRIST"),
    "ankle": ("KNEE", "ANKLE", "FOOT_INDEX"),
}


def angle(a, b, c):
    """Interior angle (degrees) at vertex b, in pixel space."""
    v1 = (a[0] - b[0], a[1] - b[1])
    v2 = (c[0] - b[0], c[1] - b[1])
    dot = v1[0] * v2[0] + v1[1] * v2[1]
    m1, m2 = math.hypot(*v1), math.hypot(*v2)
    if m1 == 0 or m2 == 0:
        return None
    return math.degrees(math.acos(max(-1.0, min(1.0, dot / (m1 * m2)))))


class OneEuro:
    """One-Euro filter (time-aware): smooths jitter while staying responsive to
    fast moves. Works in real seconds, so it's correct for any (even variable)
    frame rate — essential for slo-mo / VFR phone video."""

    def __init__(self, min_cutoff=0.5, beta=0.3, d_cutoff=1.0):
        self.min_cutoff, self.beta, self.d_cutoff = min_cutoff, beta, d_cutoff
        self.x_prev = self.dx_prev = self.t_prev = None

    @staticmethod
    def _alpha(cutoff, dt):
        tau = 1.0 / (2 * math.pi * cutoff)
        return 1.0 / (1.0 + tau / dt)

    def __call__(self, x, t):
        if x is None:
            return self.x_prev
        if self.x_prev is None:
            self.x_prev, self.dx_prev, self.t_prev = x, 0.0, t
            return x
        dt = max(1e-3, t - self.t_prev)
        self.t_prev = t
        dx = (x - self.x_prev) / dt
        a_d = self._alpha(self.d_cutoff, dt)
        self.dx_prev = a_d * dx + (1 - a_d) * self.dx_prev
        cutoff = self.min_cutoff + self.beta * abs(self.dx_prev)
        a = self._alpha(cutoff, dt)
        self.x_prev = a * x + (1 - a) * self.x_prev
        return self.x_prev


def ensure_model():
    if not os.path.exists(MODEL_PATH):
        print(f"Downloading pose model -> {MODEL_PATH} ...")
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)


def pick_side(lm):
    """Choose the leg facing the camera by average landmark visibility."""
    def vis(col):
        return np.mean([lm[IDX[p][col]].visibility for p in ("HIP", "KNEE", "ANKLE")])
    return "RIGHT" if vis(1) >= vis(0) else "LEFT"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--side", choices=["auto", "left", "right"], default="auto")
    ap.add_argument("--joint", choices=list(JOINTS), default="knee")
    ap.add_argument("--plot", default="angle_plot.png")
    ap.add_argument("--csv", default="angles.csv")
    ap.add_argument("--vis", type=float, default=0.5,
                    help="min landmark visibility to trust a frame (0..1)")
    args = ap.parse_args()

    ensure_model()
    cap = cv2.VideoCapture(args.video)
    a_name, b_name, c_name = JOINTS[args.joint]

    options = vision.PoseLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=vision.RunningMode.VIDEO,
    )

    smoother = OneEuro()
    times, angles, side = [], [], args.side.upper()
    frame_i, last_ms = 0, -1

    with vision.PoseLandmarker.create_from_options(options) as landmarker:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            h, w = frame.shape[:2]
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            # Real (VFR/slo-mo-aware) timestamp; force strictly increasing ms.
            pos_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
            ts_ms = max(last_ms + 1, int(pos_ms))
            last_ms = ts_ms
            t = ts_ms / 1000.0
            res = landmarker.detect_for_video(mp_image, ts_ms)
            frame_i += 1

            if not res.pose_landmarks:
                continue
            lm = res.pose_landmarks[0]  # first detected person
            if side == "AUTO":
                side = pick_side(lm)  # lock to one side on first good frame
                print(f"Tracking {side} {args.joint} (auto-selected).")
            col = SIDE_COL[side]

            # Landmarks are normalized 0..1 — multiply by pixel size so the
            # angle is computed in true (aspect-correct) image space.
            def get(name):
                return lm[IDX[name][col]]

            pts = [get(a_name), get(b_name), get(c_name)]
            # Drop low-confidence frames (e.g. ankle hidden behind crank/pedal),
            # which is what produced the spurious deep-flexion spikes.
            if min(p.visibility for p in pts) < args.vis:
                continue
            raw = angle(*[(p.x * w, p.y * h) for p in pts])
            times.append(t)
            angles.append(smoother(raw, t))

    cap.release()
    angles = np.array([a for a in angles if a is not None], dtype=float)
    times = np.array(times[: len(angles)])
    if len(angles) < 5:
        print("Not enough tracked frames — check the video/side.")
        return

    duration = times[-1] - times[0]
    fps = len(times) / duration if duration > 0 else 30.0
    # Per-stroke extrema. Require prominence ~40% of the signal's range so a
    # single extreme is picked per stroke and tiny wiggles at the top/bottom
    # aren't miscounted as extra strokes (which mixed highs and lows together).
    prom = 0.4 * (np.percentile(angles, 95) - np.percentile(angles, 5))
    peaks, _ = find_peaks(angles, prominence=prom)
    troughs, _ = find_peaks(-angles, prominence=prom)

    def summary(name, idx):
        if len(idx) == 0:
            print(f"  {name}: (none detected)")
            return
        vals = angles[idx]
        print(f"  {name}: {vals.mean():.1f}° ± {vals.std():.1f}°  "
              f"(n={len(vals)}, range {vals.min():.1f}-{vals.max():.1f}°)")

    print(f"\nFrames tracked: {len(angles)}  |  fps: {fps:.1f}  |  "
          f"strokes ~{min(len(peaks), len(troughs))}")
    print(f"{args.joint.capitalize()} angle:")
    summary("Max extension (per stroke)", peaks)
    summary("Max flexion  (per stroke)", troughs)
    print(f"  Robust overall range (5th-95th pct): "
          f"{np.percentile(angles, 5):.1f}-{np.percentile(angles, 95):.1f}°")

    with open(args.csv, "w", newline="") as f:
        wri = csv.writer(f)
        wri.writerow(["time_s", f"{args.joint}_deg"])
        wri.writerows(zip(times.round(3), angles.round(2)))
    print(f"Wrote {args.csv}")

    try:
        import matplotlib.pyplot as plt
        plt.figure(figsize=(12, 4))
        plt.plot(times, angles, lw=1, label=f"{args.joint} angle")
        plt.plot(times[peaks], angles[peaks], "g^", label="extension")
        plt.plot(times[troughs], angles[troughs], "rv", label="flexion")
        plt.xlabel("time (s)"); plt.ylabel("degrees"); plt.legend()
        plt.title(f"{side} {args.joint} angle over time")
        plt.tight_layout(); plt.savefig(args.plot, dpi=120)
        print(f"Wrote {args.plot}")
    except ImportError:
        print("(install matplotlib for the plot)")


if __name__ == "__main__":
    main()
