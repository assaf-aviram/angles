"""
Render a session JSON into an animated GIF with the angle overlay baked in.

Reuses the output of the trackers / exporters (session_export.json): each image
has a base64 frame + normalized points, so we redraw the same overlay the webapp
shows (polyline, dots, interior + reflex arcs, angle labels) straight into the
pixels and assemble a looping GIF. Extreme frames are held a beat longer.

Usage:
    python make_gif.py session_export.json out.gif
    python make_gif.py session_export.json out.gif --fps 12 --max-dim 600
"""

import argparse
import base64
import io
import json
import math

from PIL import Image, ImageDraw, ImageFont

RED = (239, 68, 68)
GREEN = (52, 211, 153)
YELLOW = (250, 204, 21)
CYAN = (34, 211, 238)
BLACK = (0, 0, 0)


def get_font(size):
    for name in ("DejaVuSans-Bold.ttf", "DejaVuSans.ttf", "Arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # older Pillow
        return ImageFont.load_default()


def decode(src):
    b64 = src.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")


def ray_angle(frm, to):
    return math.degrees(math.atan2(to[1] - frm[1], to[0] - frm[0]))


def interior(prev, v, nxt):
    a = (prev[0] - v[0], prev[1] - v[1])
    b = (nxt[0] - v[0], nxt[1] - v[1])
    ma, mb = math.hypot(*a), math.hypot(*b)
    if ma == 0 or mb == 0:
        return 0.0
    c = max(-1.0, min(1.0, (a[0] * b[0] + a[1] * b[1]) / (ma * mb)))
    return math.degrees(math.acos(c))


def draw_arc(d, center, r, a1, a2, reflex, color, width):
    delta = ((a2 - a1 + 180) % 360) - 180  # signed shortest, (-180, 180]
    s, e = (a1, a2) if delta >= 0 else (a2, a1)  # minor sweep, clockwise
    if reflex:
        s, e = e, s  # take the long way round
    bbox = [center[0] - r, center[1] - r, center[0] + r, center[1] + r]
    d.arc(bbox, s, e, fill=color, width=width)


def label(d, font, pos, text, color):
    d.text(pos, text, font=font, fill=color, anchor="mm",
           stroke_width=3, stroke_fill=BLACK)


def render(image):
    img = decode(image["src"])
    w, h = img.size
    pts = [(p["x"] * w, p["y"] * h) for p in image.get("points", [])]
    main = image.get("mainPointIndex", 1)

    short = min(w, h)
    r_small = max(16, int(0.05 * short))
    r_big = max(26, int(0.085 * short))
    dot_r = max(4, int(0.012 * short))
    lw = max(2, int(0.006 * short))
    font = get_font(max(14, int(0.035 * short)))

    d = ImageDraw.Draw(img)
    if len(pts) > 1:
        d.line(pts, fill=RED, width=lw, joint="curve")

    for i in range(1, len(pts) - 1):
        prev, v, nxt = pts[i - 1], pts[i], pts[i + 1]
        a1, a2 = ray_angle(v, prev), ray_angle(v, nxt)
        is_main = i == main
        small = interior(prev, v, nxt)
        draw_arc(d, v, r_big, a1, a2, True, CYAN, max(2, lw - 1))
        draw_arc(d, v, r_small, a1, a2, False, GREEN if is_main else YELLOW, lw)

        # Place labels along each bisector.
        ua = _unit((prev[0] - v[0], prev[1] - v[1]))
        ub = _unit((nxt[0] - v[0], nxt[1] - v[1]))
        bis = _unit((ua[0] + ub[0], ua[1] + ub[1])) or (-ua[1], ua[0])
        lp = (v[0] + bis[0] * (r_small + r_small), v[1] + bis[1] * (r_small + r_small))
        bp = (v[0] - bis[0] * (r_big + r_small // 2),
              v[1] - bis[1] * (r_big + r_small // 2))
        label(d, font, lp, f"{small:.1f}", GREEN if is_main else YELLOW)
        label(d, font, bp, f"{360 - small:.1f}", CYAN)

    for i, p in enumerate(pts):
        c = GREEN if i == main else RED
        d.ellipse([p[0] - dot_r, p[1] - dot_r, p[0] + dot_r, p[1] + dot_r],
                  fill=c, outline=(255, 255, 255), width=max(1, dot_r // 3))

    return img


def _unit(v):
    m = math.hypot(*v)
    return (v[0] / m, v[1] / m) if m else (0.0, 0.0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("session")
    ap.add_argument("out", nargs="?", default="overlay.gif")
    ap.add_argument("--fps", type=float, default=12)
    ap.add_argument("--max-dim", type=int, default=600)
    ap.add_argument("--hold-ms", type=int, default=700,
                    help="duration for extreme (min/max) frames")
    args = ap.parse_args()

    session = json.load(open(args.session))
    images = session.get("images", [])
    if not images:
        print("No images in session.")
        return

    base_ms = int(1000 / args.fps)
    frames, durations = [], []
    for im in images:
        frame = render(im)
        scale = min(1.0, args.max_dim / max(frame.size))
        if scale < 1.0:
            frame = frame.resize(
                (round(frame.width * scale), round(frame.height * scale)),
                Image.LANCZOS)
        frames.append(frame.convert("P", palette=Image.ADAPTIVE))
        durations.append(args.hold_ms if im.get("extreme") else base_ms)

    frames[0].save(args.out, save_all=True, append_images=frames[1:],
                   duration=durations, loop=0, disposal=2, optimize=True)
    print(f"Wrote {args.out}: {len(frames)} frames, {frames[0].size[0]}x"
          f"{frames[0].size[1]}.")


if __name__ == "__main__":
    main()
