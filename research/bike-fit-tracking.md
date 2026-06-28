# Bike-fit angle tracking — findings & gotchas

Reference notes from building the video → joint-angle pipeline. Read this before
touching the `experiments/` scripts again; most of these cost real debugging time.

## The big picture

Goal: measure joint angles (knee/hip/elbow/ankle) across a pedal stroke from a
side-on video, and report the **range of motion** (flexion → extension).

Three ways to get the points, worst → best for this use case:

| Approach | Tool | Verdict |
|---|---|---|
| Markerless pose | MediaPipe `PoseLandmarker` (`bike_angle_track.py`) | Easy, fully automatic, but **±5° and depth-blind**. Guesses joint *centers* from appearance; ignores physical markers. Fine for ROM trends, not for a single fit-critical frame. |
| Optical flow | OpenCV Lucas–Kanade (`track_markers.py`) | Tracks the *pixels* you click. Accurate frame-to-frame, **drifts** over time; weak on low-contrast markers. Fast, CPU-only. |
| Learned point tracker | **CoTracker3** (`track_markers_cotracker.py`) | **Winner.** Transformer that tracks points jointly across time; robust to drift and brief occlusion (ankle behind crank). Needs PyTorch + a GPU to be practical. |

**Current best workflow:** physical markers on the joints → click-seed once →
CoTracker3 on the GPU → export session JSON → import in the web app to verify /
drag-correct → `make_gif.py` for a shareable overlay.

## Gotchas that bit us (in order of pain)

### 1. Slo-mo video lies about frame rate
iPhone slo-mo is variable/high frame rate. `cv2.CAP_PROP_FPS` returns garbage
(~157 instead of the true capture rate), and `CAP_PROP_POS_MSEC` is often just
`frame_index / fps` internally, so it inherits the same lie.
- **Effect:** wrong fps under-smooths the One-Euro filter and mis-sizes the
  pedal-stroke spacing for peak detection.
- **Fix:** derive effective fps from `len(frames) / (t_last - t_first)` and feed a
  *time-aware* One-Euro filter (works in real seconds, robust to any frame rate).

### 2. Normalized points must denormalize by each image's width/height
Points are stored normalized **per-axis** (`x/w`, `y/h`), which squashes the
aspect ratio. Computing an angle on raw normalized coords gives the wrong degrees
on non-square images. Always multiply back by that image's `width`/`height`
(or the display box, which has the same aspect) before computing angles.

### 3. Global min/max is an outlier trap
`np.argmax`/`argmin` over thousands of frames returns the single most extreme
value — exactly where one bad-tracking frame hides. The famous bad frame read
160° because the landmark popped.
- **Fix:** report **per-stroke** stats with **prominence-filtered** peaks
  (`scipy.signal.find_peaks(prominence=0.4*range)`), and quote the per-stroke
  mean ± std or 5th–95th percentile, **not** the raw extremes. With clean data
  the std collapsed from ±41° to ±1.5°.

### 4. Landmark jitter → spurious deep-flexion spikes (pose only)
The ankle landmark jumps when the foot/pedal/crank area is visually busy.
- **Fix:** drop frames where `landmark.visibility < 0.5`. Removed the bogus 30°
  dips (floor rose to a real ~68°).

### 5. MediaPipe split its API
Newer wheels (0.10.3x) ship **only** the Tasks API (`mediapipe.tasks`); the
legacy `mp.solutions.pose` is gone → `AttributeError: module 'mediapipe' has no
attribute 'solutions'`. Use `PoseLandmarker` (Tasks) and download the `.task`
model file explicitly. `detect_for_video` needs **monotonically increasing ms
timestamps**. The 33 landmark indices are identical across both APIs.

### 6. Python version / wheels
MediaPipe + PyTorch ship binary wheels for specific CPython ABIs. **Python 3.14
has no wheels yet** → installs fail. Use **3.12** (via `uv`). On Arch the system
Python is too new; `uv venv --python 3.12` sidesteps it.

### 7. localStorage quota
Frames are base64 in localStorage (~5 MB cap, UTF-16 doubles it). ~5–10 annotated
frames or one ~3 MB imported session is the ceiling. Import is wrapped in
try/catch — on overflow it warns and the in-memory session still works until
reload. IndexedDB is the upgrade path if this ever bites.

### 8. Headless seeding (SSH / no display)
`cv2.imshow` needs a display. For remote/desktop GPU runs, the trackers accept
`--seed "x,y;x,y;x,y"` (pixel coords on the start frame) and `--dump-frame PATH`.
They also **print the seed** after a GUI click, so you can seed once on a machine
with a display and reuse the coords headless.

## Capture tips (toward "idiot-proof")
- **Markers:** flat *matte* colored circles (~2–3 cm), a distinct color per joint,
  on the lateral landmarks — greater trochanter (hip), lateral epicondyle (knee),
  lateral malleolus (ankle). Matte avoids glare.
- **Lighting:** light on the **camera side**; never backlit (a bright window
  behind the rider silhouettes the legs and wrecks contrast — the #1 tracker
  killer here).
- **Camera:** tripod, lens perpendicular to the bike, centered on hip–knee,
  locked exposure.
- **Next unlock:** distinct colors enable **color-blob auto-seeding** (HSV
  threshold → centroid), removing the manual click step entirely.

## Useful numbers from the reference fit chart
Side-view targets (vary by methodology): knee 65–145°, hip/torso 60–110°,
torso/shoulder 65–75°, elbow 150–160°, ankle 115–180°. Our clean knee read was
~70° flexion / ~156° extension (extension a touch high → possibly saddle height,
but not a clinical claim).
