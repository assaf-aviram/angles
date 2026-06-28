"""
Manual-seed marker tracker.

You click your markers (hip -> knee -> ankle) on ONE frame; Lucas-Kanade optical
flow then follows those exact pixels through the rest of the video. Because it
tracks your physical markers instead of guessing joint centers, it's far more
faithful than pose estimation when you've actually marked the joints.

Outputs a session JSON you import into the webapp to verify/scrub/drag-correct.

Usage:
    python track_markers.py trim-shorter.mov
    python track_markers.py clip.mov --joint knee --start-frame 30 --window 12

Tips:
  - Pick --start-frame where ALL markers are clearly visible (e.g. mid-stroke).
  - Tracking runs forward from that frame, so put the seed near the start.
"""

import argparse
import json
import time
import uuid

import cv2
import numpy as np

from bike_angle_track import angle, JOINTS
from export_overlay_session import encode_jpeg

LK = dict(
    winSize=(31, 31),
    maxLevel=3,
    criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01),
)
DISPLAY_MAX = 1000


def read_at(cap, start):
    """Sequentially advance to `start` and return that frame (VFR-safe)."""
    for _ in range(start):
        if not cap.read()[0]:
            return None
    ok, frame = cap.read()
    return frame if ok else None


def parse_seed(text):
    """Parse '--seed' as 'x,y;x,y;x,y' pixel coords. Returns [(x, y), ...]."""
    pts = []
    for pair in text.split(";"):
        x, y = pair.split(",")
        pts.append((float(x), float(y)))
    return pts


def get_seed(video, start_frame, labels, seed_text):
    """Seed points either from --seed (headless) or by clicking (needs a GUI)."""
    if seed_text:
        return parse_seed(seed_text)
    cap = cv2.VideoCapture(video)
    frame = read_at(cap, start_frame)
    cap.release()
    if frame is None:
        return []
    return click_points(frame, labels)


def click_points(frame, labels):
    """Show the frame; collect one click per label. Returns full-res (x, y)."""
    h, w = frame.shape[:2]
    scale = min(1.0, DISPLAY_MAX / max(h, w))
    disp = cv2.resize(frame, (round(w * scale), round(h * scale)))
    pts, title = [], "Click: " + " -> ".join(labels) + "   (Esc to cancel)"

    def on_mouse(event, x, y, *_):
        if event == cv2.EVENT_LBUTTONDOWN and len(pts) < len(labels):
            pts.append((x / scale, y / scale))
            cv2.circle(disp, (x, y), 5, (0, 0, 255), -1)
            if len(pts) > 1:
                cv2.line(disp, tuple(map(int, np.array(pts[-2]) * scale)),
                         (x, y), (0, 0, 255), 2)
            cv2.imshow(title, disp)

    cv2.imshow(title, disp)
    cv2.setMouseCallback(title, on_mouse)
    while len(pts) < len(labels):
        if cv2.waitKey(20) & 0xFF == 27:
            break
    cv2.waitKey(300)
    cv2.destroyAllWindows()
    return pts


def track(video, start, seed):
    """LK-track the seeded points forward to the end. Returns records + (w, h)."""
    cap = cv2.VideoCapture(video)
    frame = read_at(cap, start)
    h, w = frame.shape[:2]
    prev = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    p0 = np.array(seed, np.float32).reshape(-1, 1, 2)
    records = [{"idx": start, "pts": [(x / w, y / h) for x, y in seed]}]

    i = start + 1
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        p1, st, _ = cv2.calcOpticalFlowPyrLK(prev, gray, p0, None, **LK)
        for k in range(len(p1)):
            if st[k][0] == 0:        # lost: keep last known position
                p1[k] = p0[k]
        records.append({"idx": i,
                        "pts": [(float(p[0][0]) / w, float(p[0][1]) / h)
                                for p in p1]})
        p0, prev = p1, gray
        i += 1
    cap.release()
    return records, w, h


def build_session(records, video, joint, window, w, h, out):
    a = np.array([
        angle(*[(p[0] * w, p[1] * h) for p in r["pts"]]) for r in records
    ])
    ext_i, flex_i = int(np.argmax(a)), int(np.argmin(a))
    print(f"Max extension {a[ext_i]:.1f}° (frame {records[ext_i]['idx']}); "
          f"max flexion {a[flex_i]:.1f}° (frame {records[flex_i]['idx']})")
    print(f"Robust range (5th-95th pct): "
          f"{np.percentile(a, 5):.1f}-{np.percentile(a, 95):.1f}°")

    def win(c):
        return range(max(0, c - window), min(len(records), c + window + 1))

    selection = ([("ext", p, ext_i) for p in win(ext_i)]
                 + [("flex", p, flex_i) for p in win(flex_i)])
    needed = {records[p]["idx"] for _, p, _ in selection}

    enc, cap, j = {}, cv2.VideoCapture(video), 0
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
        rec = records[p]
        src, ew, eh = enc[rec["idx"]]
        off = p - center
        extreme = None
        label = None
        if off == 0:
            extreme = "extension" if kind == "ext" else "flexion"
        else:
            label = f"{kind} {off:+d}"
        images.append({
            "id": str(uuid.uuid4()),
            "src": src, "width": ew, "height": eh,
            "points": [{"x": x, "y": y} for x, y in rec["pts"]],
            "mainPointIndex": 1,
            "label": label,
            "extreme": extreme,
        })

    session = {
        "id": str(uuid.uuid4()),
        "createdAt": int(time.time() * 1000),
        "name": f"Tracked {joint}: ext {a[ext_i]:.0f}° / flex {a[flex_i]:.0f}°",
        "images": images,
    }
    with open(out, "w") as f:
        json.dump(session, f)
    print(f"Wrote {out}: {len(images)} frames. Import it in the webapp.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--joint", choices=list(JOINTS), default="knee")
    ap.add_argument("--start-frame", type=int, default=0)
    ap.add_argument("--window", type=int, default=12)
    ap.add_argument("--out", default="session_export.json")
    ap.add_argument("--seed", help="headless seed: 'x,y;x,y;x,y' on start frame")
    ap.add_argument("--dump-frame", metavar="PATH",
                    help="save the start frame to PATH and exit (to read coords)")
    args = ap.parse_args()

    labels = [n.lower() for n in JOINTS[args.joint]]
    if args.dump_frame:
        cap = cv2.VideoCapture(args.video)
        frame = read_at(cap, args.start_frame)
        cap.release()
        if frame is None:
            print("Could not read the start frame.")
            return
        cv2.imwrite(args.dump_frame, frame)
        print(f"Wrote {args.dump_frame} ({frame.shape[1]}x{frame.shape[0]}). "
              f"Read off hip/knee/ankle pixel coords, pass via --seed.")
        return

    seed = get_seed(args.video, args.start_frame, labels, args.seed)
    if len(seed) < len(labels):
        print("Need all points (use --seed 'x,y;x,y;x,y' when headless).")
        return
    print("seed: " + ";".join(f"{x:.0f},{y:.0f}" for x, y in seed)
          + "   (reuse with --seed)")

    records, w, h = track(args.video, args.start_frame, seed)
    build_session(records, args.video, args.joint, args.window, w, h, args.out)


if __name__ == "__main__":
    main()
