"""
Export the frames around the detected min/max angle as a session the webapp can
import — so you can eyeball whether the extremes are real.

For each extreme (max extension, max flexion) it grabs a +/- window of frames,
stores the raw frame + the detected hip/knee/ankle points (normalized), and
writes a JSON session matching the app's store shape. The app draws the overlay,
so you see the *same* angle code — and can scrub frames with the arrow keys.

Usage:
    python export_overlay_session.py trim-shorter.mov
    python export_overlay_session.py clip.mov --joint knee --window 12 --out session_export.json
Then in the webapp: hamburger menu -> Import -> pick session_export.json
"""

import argparse
import base64
import json
import time
import uuid

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

from bike_angle_track import (
    angle, OneEuro, IDX, SIDE_COL, JOINTS, ensure_model, pick_side, MODEL_PATH,
)

EXPORT_MAX_DIM = 900   # keep base64 small enough for localStorage
JPEG_QUALITY = 70


def encode_jpeg(frame):
    """Downscale + JPEG-encode a BGR frame to a data URL. Returns (url, w, h)."""
    h, w = frame.shape[:2]
    s = min(1.0, EXPORT_MAX_DIM / max(h, w))
    if s < 1.0:
        frame = cv2.resize(frame, (round(w * s), round(h * s)),
                           interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    b64 = base64.b64encode(buf).decode()
    eh, ew = frame.shape[:2]
    return f"data:image/jpeg;base64,{b64}", ew, eh


def detect(video, side, joint):
    """Pass 1: per-frame detected points + smoothed angle for the chosen joint."""
    a, b, c = JOINTS[joint]
    options = vision.PoseLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=vision.RunningMode.VIDEO,
    )
    cap = cv2.VideoCapture(video)
    smoother = OneEuro()
    frames, last_ms, i = [], -1, 0
    with vision.PoseLandmarker.create_from_options(options) as lmk:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            h, w = frame.shape[:2]
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mpimg = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            ts = max(last_ms + 1, int(cap.get(cv2.CAP_PROP_POS_MSEC)))
            last_ms = ts
            res = lmk.detect_for_video(mpimg, ts)
            idx = i
            i += 1
            if not res.pose_landmarks:
                continue
            lm = res.pose_landmarks[0]
            if side == "AUTO":
                side = pick_side(lm)
                print(f"Tracking {side} {joint}.")
            col = SIDE_COL[side]
            pts = [lm[IDX[n][col]] for n in (a, b, c)]
            if min(p.visibility for p in pts) < 0.5:
                continue
            ang = angle(*[(p.x * w, p.y * h) for p in pts])
            frames.append({
                "idx": idx,
                "sm": smoother(ang, ts / 1000.0),
                "pts": [{"x": p.x, "y": p.y} for p in pts],
            })
    cap.release()
    return frames


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--side", choices=["auto", "left", "right"], default="auto")
    ap.add_argument("--joint", choices=list(JOINTS), default="knee")
    ap.add_argument("--window", type=int, default=12, help="frames each side")
    ap.add_argument("--out", default="session_export.json")
    args = ap.parse_args()

    ensure_model()
    frames = detect(args.video, args.side.upper(), args.joint)
    if len(frames) < 5:
        print("Not enough tracked frames.")
        return

    sm = np.array([f["sm"] for f in frames])
    ext_i, flex_i = int(np.argmax(sm)), int(np.argmin(sm))
    ext_v, flex_v = sm[ext_i], sm[flex_i]
    W = args.window
    print(f"Max extension {ext_v:.1f}° at frame {frames[ext_i]['idx']}; "
          f"max flexion {flex_v:.1f}° at frame {frames[flex_i]['idx']}")

    def win(center):
        return list(range(max(0, center - W), min(len(frames), center + W + 1)))

    # (kind, position-in-frames, center-position)
    selection = ([("ext", p, ext_i) for p in win(ext_i)]
                 + [("flex", p, flex_i) for p in win(flex_i)])
    needed = {frames[p]["idx"] for _, p, _ in selection}

    # Pass 2: re-read the video and encode only the frames we need.
    enc, cap, j = {}, cv2.VideoCapture(args.video), 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if j in needed:
            enc[j] = encode_jpeg(frame)
        j += 1
    cap.release()

    images = []
    for kind, p, center in selection:
        fr = frames[p]
        src, ew, eh = enc[fr["idx"]]
        off = p - center
        extreme = None
        label = None
        if off == 0:
            extreme = "extension" if kind == "ext" else "flexion"
        else:
            label = f"{kind} {off:+d}"
        images.append({
            "id": str(uuid.uuid4()),
            "src": src,
            "width": ew,
            "height": eh,
            "points": fr["pts"],          # [hip, knee, ankle], normalized 0..1
            "mainPointIndex": 1,          # the joint vertex
            "label": label,               # offset context for non-extreme frames
            "extreme": extreme,           # "extension" | "flexion" | None
        })

    session = {
        "id": str(uuid.uuid4()),
        "createdAt": int(time.time() * 1000),
        "name": f"Auto {args.joint}: ext {ext_v:.0f}° / flex {flex_v:.0f}°",
        "images": images,
    }
    with open(args.out, "w") as f:
        json.dump(session, f)
    print(f"Wrote {args.out}: {len(images)} frames. "
          f"Import it via the webapp hamburger menu.")


if __name__ == "__main__":
    main()
