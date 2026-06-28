# angles

A bike-fit joint-angle tool. The **web app** lets you paste/import video frames,
draw hip–knee–ankle points, and read the interior/reflex angles with arcs and
labels; sessions persist locally. The **`experiments/` Python pipeline** derives
those points automatically from video (pose estimation or marker tracking) and
exports sessions the app can import.

For the why behind the tracking choices and the gotchas, see
[`research/bike-fit-tracking.md`](research/bike-fit-tracking.md).

---

## Web app (React + Vite)

```bash
npm install
npm run dev        # dev server
npm test           # geometry unit tests (vitest)
npm run build      # production build
npm run lint       # oxlint
```

### Architecture (brief)
- **State:** Redux Toolkit (`src/store/`). `sessionsSlice` holds sessions →
  images → points; `store.js` persists to localStorage (rAF-throttled).
- **Geometry:** `src/lib/geometry.js` (TDD'd: interior/reflex angle, arc paths,
  bisector) and `src/lib/angles.js` (per-image / per-session aggregation).
- **UI:** `images.jsx` (paste + dnd-kit reorder + thumbnails), `ImageViewer.jsx`
  (expanded view, draw mode with draggable points, arrow-key frame nav),
  `AngleOverlay.jsx` (SVG overlay), `SessionsMenu.jsx` (sessions + JSON
  import/export), `SessionSummary.jsx` (range table).
- **Key conventions:** points are normalized 0–1; angles are always computed in
  aspect-correct pixel space (denormalize by the image's width/height). Images are
  downscaled JPEG data URLs so they survive reloads and fit localStorage.

---

## Python pipeline (`experiments/`)

Turns a side-on cycling video into a session of frames + detected joint points.

### Environment

**Use Python 3.12** — MediaPipe and PyTorch don't publish wheels for 3.13/3.14.
[`uv`](https://docs.astral.sh/uv/) is the easiest way to get a pinned interpreter:

```bash
cd experiments
uv venv --python 3.12
source .venv/bin/activate
uv pip install -r requirements.txt          # opencv, mediapipe, numpy, scipy, matplotlib, Pillow
```

For the learned tracker (CoTracker3) you also need PyTorch. **On a CUDA GPU**
(e.g. an RTX 3090 — strongly recommended; CPU/MPS is much slower):

```bash
# IMPORTANT on Windows: the default torch wheel is CPU-only — use the CUDA index.
uv pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
uv pip install -r requirements-cotracker.txt   # einops, tqdm, imageio
python -c "import torch; print(torch.cuda.is_available())"   # expect True
```

### Scripts

| Script | What it does |
|---|---|
| `bike_angle_track.py` | Markerless pose (MediaPipe) → angle series, per-stroke stats, plot, CSV. Auto-downloads the pose model. Fully headless. |
| `track_markers.py` | Click-seed markers → **Lucas–Kanade** optical-flow tracking → session JSON. Fast, CPU. |
| `track_markers_cotracker.py` | Click-seed markers → **CoTracker3** tracking (GPU) → session JSON. Most accurate. |
| `export_overlay_session.py` | Runs pose, finds min/max-angle frames, exports a ±window session JSON for inspection. |
| `make_gif.py` | Renders a session JSON into an animated GIF with the overlay baked in. |

### Typical run (marker tracking)

```bash
# 1. Track. Seed by clicking hip->knee->ankle (or --seed "x,y;x,y;x,y" when headless).
python track_markers_cotracker.py clip.mov --device cuda --stride 1 --proc-dim 512
#    -> writes session_export.json (and prints the seed coords for reuse)

# 2. Inspect: import session_export.json in the web app (hamburger -> Import),
#    scrub with arrow keys, drag-correct any drift in draw mode.

# 3. Share: bake the overlay into a GIF.
python make_gif.py session_export.json overlay.gif --fps 12
```

**Headless / SSH notes:** `cv2.imshow` needs a display. Use `--seed` to skip the
click, or `--dump-frame seed.png` to grab the start frame and read coordinates
off it. The scripts print the seed after a GUI click so you can capture it on a
machine with a display and reuse it on the GPU box.

### Key flags
- `--joint knee|hip|elbow|ankle` — re-tasks the tracker to any sagittal angle.
- `--start-frame N` — seed/track from frame N (pick one where markers are visible).
- `--stride N` — track every Nth frame (faster; slo-mo barely moves per frame).
- `--proc-dim PX` — tracking resolution (CoTracker); bigger = more accurate.
- `--window N` — ± frames exported around each extreme.
