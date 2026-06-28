import { mainAngleValue } from "../lib/angles";

const isExtreme = (image) =>
  image.extreme === "extension" ||
  image.extreme === "flexion" ||
  image.label?.startsWith("★"); // backward-compat with older exports

/**
 * Small corner badge for a frame.
 *  - extreme frames (the detected min/max): inverted — yellow bg, black bold,
 *    showing the *live-computed* angle (updates when points are edited).
 *  - other labelled frames: black bg, yellow text, showing the label.
 */
export const FrameTag = ({ image, className = "" }) => {
  const base = "rounded px-1.5 py-0.5 text-xs whitespace-nowrap";

  if (isExtreme(image)) {
    const a = mainAngleValue(image);
    return (
      <span className={`${base} bg-amber-400 font-bold text-black ${className}`}>
        {a != null ? `${a.toFixed(1)}°` : "—"}
      </span>
    );
  }

  if (image.label) {
    return (
      <span
        className={`${base} bg-black/70 font-medium text-amber-300 ${className}`}
      >
        {image.label}
      </span>
    );
  }

  return null;
};
