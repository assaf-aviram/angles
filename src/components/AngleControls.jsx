import { StarIcon } from "@heroicons/react/24/solid";
import { interiorAngle } from "../lib/geometry";

const fmt = (d) => `${d.toFixed(1)}°`;

/**
 * Interactive hover targets over each interior vertex (outside draw mode).
 * Hovering a vertex reveals a pop-out with its angle and a "set as main" action.
 * Rendered as HTML (not SVG) so the pop-out can be a normal styled element.
 *
 * @param points      pixel-space points (aspect-correct, from the display box)
 * @param mainIndex   index currently marked as the main value
 * @param onSetMain(i)
 */
export const AngleControls = ({ points, mainIndex, onSetMain }) => (
  <div className="pointer-events-none absolute inset-0">
    {points.map((p, i) => {
      const prev = points[i - 1];
      const next = points[i + 1];
      if (!prev || !next) return null;

      const angle = interiorAngle(prev, p, next);
      const isMain = i === mainIndex;

      return (
        <div
          key={i}
          className="group pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: p.x, top: p.y }}
        >
          {/* Hover hit-area centered on the dot. */}
          <div
            className={`size-8 rounded-full ring-2 transition ${
              isMain
                ? "ring-emerald-400"
                : "ring-transparent group-hover:ring-white/80"
            }`}
          />
          {isMain && (
            <StarIcon className="pointer-events-none absolute -top-3 -right-3 size-4 text-emerald-400 drop-shadow" />
          )}

          <div className="invisible absolute top-10 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-center whitespace-nowrap opacity-0 shadow-xl ring-1 ring-white/10 transition group-hover:visible group-hover:opacity-100">
            <div className="mb-1.5 font-mono text-sm text-gray-100">
              {fmt(angle)}
            </div>
            <button
              type="button"
              onClick={() => onSetMain(i)}
              disabled={isMain}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition ${
                isMain
                  ? "cursor-default bg-emerald-500/20 text-emerald-300"
                  : "bg-indigo-500 text-white hover:bg-indigo-400"
              }`}
            >
              {isMain ? (
                <>
                  <StarIcon className="size-3.5" /> Main value
                </>
              ) : (
                "Set as main"
              )}
            </button>
          </div>
        </div>
      );
    })}
  </div>
);
