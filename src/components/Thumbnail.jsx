import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TrashIcon } from "@heroicons/react/24/outline";
import { StarIcon } from "@heroicons/react/24/solid";
import { mainAngleValue } from "../lib/angles";
import { FrameTag } from "./FrameTag";

export const Thumbnail = ({ image, index, onOpen, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: image.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const mainAngle = mainAngleValue(image);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative aspect-video w-56 shrink-0 overflow-hidden rounded-lg bg-gray-800/75 shadow-sm inset-ring inset-ring-white/10"
    >
      {/* The image is the click target to expand; drag handle is the whole card. */}
      <button
        type="button"
        onClick={() => onOpen(image.id)}
        className="block size-full cursor-zoom-in"
        {...attributes}
        {...listeners}
      >
        <img
          src={image.src}
          alt={`Frame ${index + 1}`}
          className="size-full object-contain"
          draggable={false}
        />
      </button>

      {mainAngle != null && (
        <span className="pointer-events-none absolute bottom-1 left-1 inline-flex items-center gap-1 rounded bg-emerald-500/90 px-1.5 py-0.5 text-xs font-medium text-white">
          <StarIcon className="size-3" />
          {mainAngle.toFixed(1)}°
        </span>
      )}

      <span className="pointer-events-none absolute top-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-gray-200">
        {index + 1}
      </span>

      <FrameTag
        image={image}
        className="pointer-events-none absolute top-1 right-1"
      />

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(image.id);
        }}
        title="Delete frame"
        className="absolute top-1 right-1 z-10 rounded-md bg-black/60 p-1.5 text-gray-200 opacity-0 transition group-hover:opacity-100 hover:bg-red-600 hover:text-white focus:opacity-100"
      >
        <TrashIcon className="size-4" />
      </button>
    </div>
  );
};
