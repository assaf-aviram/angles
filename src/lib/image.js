import * as R from "ramda";

const MAX_DIM = 1600; // cap longest edge so base64 stays localStorage-friendly
const JPEG_QUALITY = 0.85;

/** Pull the first image File out of a clipboard/data-transfer payload. */
export function imageFileFromClipboard(clipboardData = {}) {
  const files = clipboardData.files ?? [];
  return R.values(files).find((f) => f?.type?.startsWith("image/")) ?? null;
}

/**
 * Read an image File into a downscaled JPEG data URL. Video-frame screenshots
 * can be multi-megabyte; capping the longest edge keeps localStorage usable and
 * the canvas overlay responsive. Resolves to `{ src, width, height }` where
 * width/height are the stored (scaled) dimensions, needed to compute
 * aspect-correct angles from normalized points.
 */
export function fileToScaledDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not decode image"));
      img.onload = () => {
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve({
          src: canvas.toDataURL("image/jpeg", JPEG_QUALITY),
          width: w,
          height: h,
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
