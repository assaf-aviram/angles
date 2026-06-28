"""
Manual-seed marker tracker using CoTracker3 (a learned point tracker).

Same workflow as track_markers.py — click hip -> knee -> ankle on one frame —
but instead of Lucas-Kanade optical flow it uses Meta's CoTracker3, a
transformer trained to follow points across time. It's far more robust to drift
and brief occlusion (e.g. the ankle passing behind the crank), at the cost of
needing PyTorch and being slower.

Install (in the venv):
    pip install -r requirements-cotracker.txt
First run downloads CoTracker3 weights via torch.hub.

Usage:
    python track_markers_cotracker.py trim-shorter.mov
    python track_markers_cotracker.py clip.mov --joint knee --proc-dim 384 --stride 2

Notes:
  - --proc-dim downsizes frames for *tracking* only (export uses full res).
  - --stride N tracks every Nth frame (faster; coarser time resolution).
  - --device auto picks mps (Apple Silicon) / cuda / cpu.
"""

import argparse
import json
import time
import uuid

import cv2
import numpy as np
import torch

from bike_angle_track import angle, JOINTS
from track_markers import click_points, read_at
from export_overlay_session import encode_jpeg


def pick_device(choice):
    if choice != "auto":
        return choice
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def load_proc_frames(video, start, stride, proc_dim, max_frames):
    """Yield-collect downsized RGB frames (for tracking) + their original idx."""
    cap = cv2.VideoCapture(video)
    if read_at(cap, start) is None:  # advance to start (frame consumed)
        cap.release()
        return [], [], 1.0
    cap.release()

    cap = cv2.VideoCapture(video)
    for _ in range(start):
        cap.read()

    frames, orig_idx, scale, j, kept = [], [], None, start, 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if (j - start) % stride == 0:
            if scale is None:
                h, w = frame.shape[:2]
                scale = min(1.0, proc_dim / max(h, w))
            small = cv2.resize(frame, None, fx=scale, fy=scale,
                               interpolation=cv2.INTER_AREA)
            frames.append(cv2.cvtColor(small, cv2.COLOR_BGR2RGB))
            orig_idx.append(j)
            kept += 1
            if max_frames and kept >= max_frames:
                break
        j += 1
    cap.release()
    return frames, orig_idx, scale


def run_cotracker(frames, queries_xy, device):
    """frames: list of HxWx3 uint8 RGB. queries_xy: Nx2 pixel coords at t=0.
    Returns tracks array (T, N, 2) in processing-resolution pixels."""
    model = torch.hub.load("facebookresearch/co-tracker",
                           "cotracker3_online").to(device).eval()
    step = model.step
    # queries: (1, N, 3) as (t, x, y); seed all at frame 0.
    q = np.concatenate([np.zeros((len(queries_xy), 1)), np.asarray(queries_xy)],
                       axis=1)
    queries = torch.tensor(q, dtype=torch.float32, device=device)[None]

    def process(window, is_first):
        chunk = torch.tensor(np.stack(window[-step * 2:]), device=device)
        chunk = chunk.float().permute(0, 3, 1, 2)[None]  # (1, T, 3, H, W)
        return model(chunk, is_first_step=is_first, queries=queries)

    window, is_first, tracks = [], True, None
    with torch.inference_mode():
        for i, fr in enumerate(frames):
            window.append(fr)
            if i % step == 0 and i != 0:
                tracks, _ = process(window, is_first)
                is_first = False
        tracks, _ = process(window, is_first)  # flush the tail
    return tracks[0].cpu().numpy()  # (T, N, 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--joint", choices=list(JOINTS), default="knee")
    ap.add_argument("--start-frame", type=int, default=0)
    ap.add_argument("--window", type=int, default=12)
    ap.add_argument("--proc-dim", type=int, default=480)
    ap.add_argument("--stride", type=int, default=1)
    ap.add_argument("--max-frames", type=int, default=0)
    ap.add_argument("--device", default="auto")
    ap.add_argument("--out", default="session_export.json")
    args = ap.parse_args()

    labels = [n.lower() for n in JOINTS[args.joint]]
    cap = cv2.VideoCapture(args.video)
    seed_frame = read_at(cap, args.start_frame)
    cap.release()
    if seed_frame is None:
        print("Could not read the start frame.")
        return
    seed = click_points(seed_frame, labels)  # full-res (x, y)
    if len(seed) < len(labels):
        print("Cancelled — need all points.")
        return

    device = pick_device(args.device)
    print(f"Loading CoTracker3 on {device} ...")
    frames, orig_idx, scale = load_proc_frames(
        args.video, args.start_frame, args.stride, args.proc_dim, args.max_frames)
    if len(frames) < 5:
        print("Not enough frames.")
        return

    queries_xy = [(x * scale, y * scale) for x, y in seed]
    print(f"Tracking {len(seed)} points across {len(frames)} frames ...")
    tracks = run_cotracker(frames, queries_xy, device)

    ph, pw = frames[0].shape[:2]
    records = [
        {"idx": orig_idx[t],
         "pts": [(float(tracks[t, n, 0]) / pw, float(tracks[t, n, 1]) / ph)
                 for n in range(tracks.shape[1])]}
        for t in range(len(frames))
    ]

    # Reuse the same session-building / export as the LK tracker.
    from track_markers import build_session
    cap = cv2.VideoCapture(args.video)
    ok, frame = cap.read()
    H, W = frame.shape[:2]
    cap.release()
    build_session(records, args.video, args.joint, args.window, W, H, args.out)


if __name__ == "__main__":
    main()
