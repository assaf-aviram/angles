import { useRef } from "react";
import num from "numeral";

import {
  interiorAngle,
  reflexAngle,
  arcPath,
  bisectorPoint,
} from "../lib/geometry";

const SMALL_R = 26; // interior-angle arc radius (px)
const BIG_R = 42; // reflex-angle arc radius (px)
const DOT_R = 6;
const GRAB_R = 14; // larger invisible hit area for grabbing a dot

const fmtDeg = (d) => `${num(d).format("0.00")}°`;

/**
 * Renders the line/dot/angle overlay in pixel coordinates.
 *
 * In draw mode: clicking empty space adds a point; pressing on an existing dot
 * and dragging repositions it.
 *
 * @param points     array of { x, y } in pixel space
 * @param width      svg width (px)
 * @param height     svg height (px)
 * @param drawMode   when true, the overlay is interactive
 * @param onAddPoint(point)        clicked { x, y } in pixel space
 * @param onMovePoint(index, point) dragged dot's new { x, y } in pixel space
 * @param mainIndex  vertex index to emphasize
 */
export const AngleOverlay = ({
  points,
  width,
  height,
  drawMode,
  onAddPoint,
  onMovePoint,
  mainIndex = null,
}) => {
  const svgRef = useRef(null);
  const dragIndex = useRef(null);

  // Pointer position in the svg's own (viewBox) coordinate space.
  function toLocal(e) {
    const r = svgRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * width,
      y: ((e.clientY - r.top) / r.height) * height,
    };
  }

  // Background press = add a point (dots stop propagation, so this only fires
  // when pressing empty space).
  function handleBackgroundDown(e) {
    if (!drawMode) return;
    onAddPoint(toLocal(e));
  }

  function handleDotDown(e, i) {
    if (!drawMode) return;
    e.stopPropagation(); // don't add a point
    dragIndex.current = i;
    svgRef.current.setPointerCapture(e.pointerId);
  }

  function handleMove(e) {
    if (dragIndex.current == null) return;
    onMovePoint(dragIndex.current, toLocal(e));
  }

  function endDrag(e) {
    if (dragIndex.current == null) return;
    dragIndex.current = null;
    svgRef.current.releasePointerCapture?.(e.pointerId);
  }

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      // overflow-visible so arcs/labels near the image edge aren't clipped.
      className={`absolute inset-0 size-full overflow-visible ${
        drawMode ? "cursor-crosshair" : "pointer-events-none"
      }`}
      onPointerDown={handleBackgroundDown}
      onPointerMove={handleMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {points.length > 1 && (
        <polyline
          points={polyline}
          fill="none"
          stroke="#ef4444"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {points.map((vertex, i) => {
        const prev = points[i - 1];
        const next = points[i + 1];
        if (!prev || !next) return null;

        const small = interiorAngle(prev, vertex, next);
        const big = reflexAngle(prev, vertex, next);
        const smallLabel = bisectorPoint(prev, vertex, next, SMALL_R + 22);

        const bigLabel = bisectorPoint(prev, vertex, next, BIG_R + 20, {
          reflex: true,
        });

        const isMain = i === mainIndex;

        return (
          <g key={`angle-${i}`}>
            <path
              d={arcPath(prev, vertex, next, BIG_R, { reflex: true })}
              fill="none"
              stroke="#22d3ee"
              strokeWidth="2"
            />
            <path
              d={arcPath(prev, vertex, next, SMALL_R)}
              fill="none"
              stroke={isMain ? "#34d399" : "#facc15"}
              strokeWidth={isMain ? 4 : 3}
            />
            <AngleLabel
              point={smallLabel}
              text={fmtDeg(small)}
              color={isMain ? "#34d399" : "#facc15"}
            />
            <AngleLabel point={bigLabel} text={fmtDeg(big)} color="#22d3ee" />
          </g>
        );
      })}

      {points.map((p, i) => (
        <g key={`dot-${i}`}>
          <circle
            cx={p.x}
            cy={p.y}
            r={DOT_R}
            fill={i === mainIndex ? "#34d399" : "#ef4444"}
            stroke="#fff"
            strokeWidth="2"
          />
          {/* Larger transparent grab target, only active in draw mode. */}
          {drawMode && (
            <circle
              cx={p.x}
              cy={p.y}
              r={GRAB_R}
              fill="transparent"
              className="cursor-move"
              style={{ touchAction: "none" }}
              onPointerDown={(e) => handleDotDown(e, i)}
            />
          )}
        </g>
      ))}
    </svg>
  );
};

const AngleLabel = ({ point, text, color }) => (
  <g className="font-mono">
    <text
      x={point.x}
      y={point.y}
      textAnchor="middle"
      dominantBaseline="middle"
      stroke="#000"
      strokeWidth="4"
      paintOrder="stroke"
      fill={color}
      fontSize="16"
      fontWeight="700"
    >
      {text}
    </text>
  </g>
);
