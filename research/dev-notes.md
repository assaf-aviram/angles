# Developer notes for the next agent

Orientation for picking up this repo cold. Pairs with
[`bike-fit-tracking.md`](bike-fit-tracking.md), which covers the *domain*
(tracking approaches, capture tips, debugging war stories). **This** doc covers
the *codebase*: how it's wired, the conventions you must not break, and where the
sharp edges are. Read both before changing anything.

## What this is

A bike-fit joint-angle tool in two halves that meet at one JSON shape:

- **Web app** (React + Vite, root of repo) — paste/import frames, draw
  hip→knee→ankle points, read interior/reflex angles, persist sessions locally.
- **Python pipeline** (`experiments/`) — derive those points from video
  automatically and emit a session JSON the app can import.

The contract between them is the **session JSON** (see "The data model" below).
If you change that shape on one side, change it on both.

## Repo map

```
src/
  lib/
    geometry.js        # pure math: interiorAngle, reflexAngle, bisectorPoint, arcPath
    geometry.test.js   # vitest; the ONLY tests. Keep them green.
    angles.js          # per-image / per-session aggregation (angleAt, mainAngleValue, sessionAngleStats)
    image.js           # clipboard read + downscale-to-dataURL (fileToScaledDataUrl)
  store/
    sessionsSlice.js   # all app state + actions/selectors (single slice)
    store.js           # configureStore + localStorage persistence (rAF-throttled)
  components/
    images.jsx         # top-level: paste handler, dnd-kit reorder, thumbnail grid, SessionSummary
    Thumbnail.jsx      # one grid cell (index badge, FrameTag, delete-on-hover, main-angle ★)
    ImageViewer.jsx    # expanded modal: draw mode, draggable points, arrow-key frame nav
    AngleOverlay.jsx   # the SVG overlay (add/drag points, arcs, labels)
    AngleControls.jsx  # hover "set as main" popout (non-draw mode)
    SessionsMenu.jsx   # hamburger: new / import / export / delete sessions
    SessionSummary.jsx # "angle ranges across this session" table
    FrameTag.jsx       # the top-right value tag (extreme vs normal styling)
    nav.jsx            # app chrome
experiments/           # Python; see bike-fit-tracking.md + README for the pipeline
research/              # this doc + tracking findings
```

## The data model (the contract)

One session:

```js
{
  id, createdAt, name,
  images: [{
    id, src,            // src = downscaled JPEG data URL
    width, height,      // natural px of the (downscaled) image — REQUIRED for correct angles
    points: [{x, y}],   // normalized 0..1, PER-AXIS (x/width, y/height)
    mainPointIndex,     // null => "first computable angle" (index 1); see effectiveMainIndex
    extreme,            // optional: "flexion" | "extension" — set by the Python exporter
    label,              // optional string tag
  }]
}
```

Non-negotiable invariants:

1. **Points are normalized per-axis (0..1).** They squash aspect ratio on
   purpose so they survive resize. You must **denormalize by that image's
   `width`/`height` before computing any angle** — `angles.js#angleAt` is the
   only blessed path. Computing on raw normalized coords gives wrong degrees on
   non-square images. This bug is invisible on square images, so it hides.
2. **An angle needs three points.** Interior vertices are indices `1 .. n-2`.
   Index 0 and `n-1` have no angle. `mainPointIndex` must stay in `[1, n-2]`;
   `saveImagePoints` already nulls a stale selection — keep that.
3. **`mainPointIndex: null` means "fall back to index 1."** Don't write `1`
   where you mean "default"; the null-vs-1 distinction is intentional so an
   explicit choice survives point edits differently from a default.

The Python exporter and `make_gif.py` reimplement angle math independently in
Python. If you touch the JS geometry, eyeball `experiments/make_gif.py` (its
`interior`, `draw_arc`) so the baked GIF still matches the on-screen overlay.

## State & persistence

- **One Redux slice** (`sessionsSlice`) holds everything: sessions list,
  `currentSessionId`, `selectedImageId`, `drawMode`. Selectors live at the bottom
  of the same file — use them, don't reach into `state.sessions.*` from
  components.
- **Sessions are stored in creation order**; the UI sorts newest-first for
  display. Don't re-sort the array in the store.
- **A session is created lazily on first paste** (`addImage`), so "no session
  yet" is a normal state, not an error.
- **Persistence** is a `store.subscribe` in `store.js`, throttled with
  `requestAnimationFrame`, writing the whole state to `localStorage` under
  `angles.sessions.v1`. The write is wrapped in try/catch for
  `QuotaExceededError`.
- **localStorage is the real constraint.** Frames are base64 in a ~5 MB store
  (UTF-16 ~doubles it). Ballpark ceiling: ~5–10 annotated frames, or one ~3 MB
  imported session. On overflow the in-memory session keeps working until
  reload. **IndexedDB is the planned upgrade path** if this ever bites — that's
  the right next move, not "compress harder." If you bump the schema, bump the
  `v1` key and add a migration/clear.

## Conventions that keep things consistent

- **Geometry is TDD'd and pure.** `geometry.js` has no React/DOM. Add a failing
  test in `geometry.test.js` first, then implement. `npm test` is fast; keep it
  green — it's the only safety net.
- **Colors are shared by meaning, duplicated by necessity.** emerald `#34d399` =
  main vertex/angle, cyan = reflex, amber/yellow = secondary, red = points/lines.
  The same palette is hard-coded again in `make_gif.py` (RGB tuples). Change both.
- **SVG overlay uses `overflow-visible`** so arcs/labels near the image edge
  aren't clipped (this was a real bug fix — don't reintroduce a clipping
  container).
- **Pointer logic in `AngleOverlay`**: click-to-add vs drag-to-move is
  distinguished by hit-testing transparent grab circles (`GRAB_R`) with pointer
  capture. dnd-kit's `PointerSensor` uses an 8px activation distance so a click
  isn't read as a drag. If you fiddle with one, re-test the other.
- **Draw mode persists across frame navigation** in `ImageViewer` — arrow keys
  save the current points then re-enter draw mode on the next frame. This is
  intentional (user asked for it explicitly); don't "fix" it to exit on nav.
- **Numbers** are formatted via `numeral`; degrees via the `fmtDeg` helper.

## Python side (pointers, not a rehash)

Full setup + run flow is in the README; the *why* is in `bike-fit-tracking.md`.
The essentials for not getting stuck:

- **Python 3.12 only** (mediapipe/torch have no 3.13/3.14 wheels). Use `uv venv
  --python 3.12`.
- **CoTracker3 on the CUDA box (RTX 3090) is the chosen tracker.** MPS/CPU work
  but are slow. On Windows you MUST use the CUDA torch index URL or you get a
  CPU-only wheel silently.
- **Headless/SSH**: no `cv2.imshow`. Use `--seed "x,y;x,y;x,y"` (the trackers
  print the seed after a GUI click so you can capture once and reuse) or
  `--dump-frame`.
- `session_export.json` (~3.4 MB) and `pose_landmarker_heavy.task` (29 MB) live
  in `experiments/` but media/large artifacts are gitignored
  (`*.mov`, `*.task`, `*.csv`, `*.png`, GIFs, `session_export.json`). Don't try
  to commit them.

## Known-good state & loose ends

- Working tree is clean as of this writing; `make_gif.py`, the docs, and
  requirements are all committed. There is no CI — `npm test` and `npm run lint`
  (oxlint) are the gates, run them locally.
- **Offered but not built** (no user sign-off yet — confirm before doing):
  - **Color-blob auto-seeding** (HSV threshold → centroid) to kill the manual
    click. This is the highest-value next unlock per the user; needs the colored
    markers from the capture tips.
  - Forward-backward error gating for the Lucas–Kanade tracker (drift rejection).
  - In-browser MediaPipe Tasks (JS) so tracking runs without the Python hop.
  - A TAPIR variant alongside CoTracker.
  - IndexedDB migration for the storage ceiling above.

## Working norms for this repo

- The user is hands-on and iterates fast with terse feedback ("it's whack",
  "stay in draw mode"). Prefer small, verifiable changes; show the result.
- **Don't commit or push unless asked.** Earlier a push to `main` was correctly
  declined because it wasn't requested — give the user the commands instead.
- This session runs in **learning/explanatory** output style: explain the *why*
  of non-obvious choices, and hand the user the meaningful 5–10 line decisions
  (business logic, trade-offs) rather than writing every line yourself.
