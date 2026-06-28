import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  PencilIcon,
  CheckIcon,
  ArrowUturnLeftIcon,
  XMarkIcon,
  TrashIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import {
  selectSelectedImage,
  selectCurrentImages,
  selectDrawMode,
  setDrawMode,
  saveImagePoints,
  setMainPoint,
  selectImage,
  closeImage,
} from "../store/sessionsSlice";
import { effectiveMainIndex } from "../lib/angles";
import { AngleOverlay } from "./AngleOverlay";
import { AngleControls } from "./AngleControls";
import { FrameTag } from "./FrameTag";

export const ImageViewer = () => {
  const dispatch = useDispatch();
  const image = useSelector(selectSelectedImage);
  const images = useSelector(selectCurrentImages);
  const drawMode = useSelector(selectDrawMode);

  const index = images.findIndex((i) => i.id === image?.id);
  const canPrev = index > 0;
  const canNext = index >= 0 && index < images.length - 1;

  const imgRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Working copy of points (normalized 0..1) while drawing.
  const [draft, setDraft] = useState([]);

  // Track the rendered image box so we can map normalized <-> pixel coords.
  useLayoutEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [image?.id]);

  // Seed the draft from saved points whenever we enter draw mode.
  useEffect(() => {
    if (drawMode && image) setDraft(image.points ?? []);
  }, [drawMode, image?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Move to the previous/next frame. While drawing, persist edits first so the
  // outgoing frame keeps its points, then stay in draw mode on the new frame.
  const navigate = useCallback(
    (delta) => {
      const target = images[index + delta];
      if (!target) return;
      const wasDrawing = drawMode && image;
      if (wasDrawing) {
        dispatch(saveImagePoints({ imageId: image.id, points: draft }));
      }
      dispatch(selectImage(target.id));
      if (wasDrawing) dispatch(setDrawMode(true));
    },
    [dispatch, images, index, drawMode, image, draft],
  );

  // Keyboard: Escape exits, arrows navigate frames.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        dispatch(drawMode ? setDrawMode(false) : closeImage());
      } else if (e.key === "ArrowLeft") {
        navigate(-1);
      } else if (e.key === "ArrowRight") {
        navigate(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, drawMode, navigate]);

  if (!image) return null;

  const saved = image.points ?? [];
  const activePoints = drawMode ? draft : saved;
  const toPixels = (p) => ({ x: p.x * size.w, y: p.y * size.h });
  const pixelPoints = size.w ? activePoints.map(toPixels) : [];
  const mainIndex = drawMode ? null : effectiveMainIndex(image);

  function addPoint(pixel) {
    if (!size.w) return;
    setDraft((prev) => [...prev, { x: pixel.x / size.w, y: pixel.y / size.h }]);
  }

  function movePoint(i, pixel) {
    if (!size.w) return;
    const x = Math.min(1, Math.max(0, pixel.x / size.w));
    const y = Math.min(1, Math.max(0, pixel.y / size.h));
    setDraft((prev) => prev.map((p, idx) => (idx === i ? { x, y } : p)));
  }

  function save() {
    dispatch(saveImagePoints({ imageId: image.id, points: draft }));
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm">
      <Toolbar
        drawMode={drawMode}
        pointCount={activePoints.length}
        position={index >= 0 ? `${index + 1} / ${images.length}` : ""}
        onDraw={() => dispatch(setDrawMode(true))}
        onSave={save}
        onUndo={() => setDraft((p) => p.slice(0, -1))}
        onClear={() => setDraft([])}
        onClose={() => dispatch(closeImage())}
      />

      <div className="relative flex flex-1 items-center justify-center overflow-auto p-4">
        <NavButton
          side="left"
          disabled={!canPrev}
          onClick={() => navigate(-1)}
        />
        <NavButton
          side="right"
          disabled={!canNext}
          onClick={() => navigate(1)}
        />
        <div className="relative inline-block">
          <img
            ref={imgRef}
            src={image.src}
            alt="Selected frame"
            className="block max-h-[82vh] max-w-[94vw] object-contain select-none"
            draggable={false}
          />
          {!drawMode && (
            <FrameTag
              image={image}
              className="pointer-events-none absolute top-2 right-2 z-10 text-sm"
            />
          )}
          {size.w > 0 && (
            <AngleOverlay
              points={pixelPoints}
              width={size.w}
              height={size.h}
              drawMode={drawMode}
              onAddPoint={addPoint}
              onMovePoint={movePoint}
              mainIndex={mainIndex}
            />
          )}
          {size.w > 0 && !drawMode && (
            <AngleControls
              points={pixelPoints}
              mainIndex={mainIndex}
              onSetMain={(i) =>
                dispatch(setMainPoint({ imageId: image.id, pointIndex: i }))
              }
            />
          )}
        </div>
      </div>

      {drawMode && (
        <p className="pb-3 text-center text-sm text-gray-300">
          Click to drop points; drag a point to reposition it.
        </p>
      )}
    </div>
  );
};

const Toolbar = ({
  drawMode,
  pointCount,
  position,
  onDraw,
  onSave,
  onUndo,
  onClear,
  onClose,
}) => (
  <div className="flex w-full items-center justify-between gap-2 border-b border-white/10 bg-gray-900/80 px-4 py-3">
    <div className="flex mx-auto max-w-3xl w-full">
      <div className="flex items-center gap-2">
        {!drawMode ? (
          <Btn onClick={onDraw} icon={PencilIcon} primary>
            Draw angles
          </Btn>
        ) : (
          <>
            <Btn onClick={onSave} icon={CheckIcon} primary>
              Done &amp; save
            </Btn>
            <Btn
              onClick={onUndo}
              icon={ArrowUturnLeftIcon}
              disabled={!pointCount}
            >
              Undo
            </Btn>
            <Btn onClick={onClear} icon={TrashIcon} disabled={!pointCount}>
              Clear
            </Btn>
            <span className="ml-1 text-sm text-gray-400">
              {pointCount} points
            </span>
          </>
        )}
      </div>
      <div className="ml-auto flex items-center gap-3">
        {position && (
          <span className="text-sm tabular-nums text-gray-400">{position}</span>
        )}
        <Btn onClick={onClose} icon={XMarkIcon}>
          Close
        </Btn>
      </div>
    </div>
  </div>
);

const NavButton = ({ side, disabled, onClick }) => {
  const Icon = side === "left" ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "Previous frame" : "Next frame"}
      className={[
        "absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition",
        "hover:bg-white/25 disabled:pointer-events-none disabled:opacity-0",
        side === "left" ? "left-3" : "right-3",
      ].join(" ")}
    >
      <Icon className="size-6" />
    </button>
  );
};

const Btn = ({ onClick, icon: Icon, children, primary, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={[
      "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition",
      "disabled:cursor-not-allowed disabled:opacity-40",
      primary
        ? "bg-indigo-500 text-white hover:bg-indigo-400"
        : "bg-white/10 text-gray-200 hover:bg-white/20",
    ].join(" ")}
  >
    <Icon className="size-4" />
    {children}
  </button>
);
