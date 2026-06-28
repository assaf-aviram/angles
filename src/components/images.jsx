import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import {
  addImage,
  removeImage,
  reorderImages,
  selectImage,
  selectCurrentImages,
} from "../store/sessionsSlice";
import { imageFileFromClipboard, fileToScaledDataUrl } from "../lib/image";
import { Thumbnail } from "./Thumbnail";
import { SessionSummary } from "./SessionSummary";

export const Images = () => {
  const dispatch = useDispatch();
  const images = useSelector(selectCurrentImages);
  const state = useSelector((s) => {
    console.log("state", s) || false;
  });

  // Require a small drag distance so a plain click still opens the image.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  useEffect(() => {
    async function handlePaste(evt) {
      const file = imageFileFromClipboard(
        evt.clipboardData || window?.clipboardData,
      );
      if (!file) return;
      evt.preventDefault();
      try {
        const imported = await fileToScaledDataUrl(file);
        dispatch(addImage(imported));
      } catch (err) {
        console.warn("Could not import pasted image:", err);
      }
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [dispatch]);

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    const fromIndex = images.findIndex((i) => i.id === active.id);
    const toIndex = images.findIndex((i) => i.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;
    dispatch(reorderImages({ fromIndex, toIndex }));
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Frames</h2>
        <p className="text-sm text-gray-400">
          Paste a screenshot (⌘/Ctrl+V) to add a frame
        </p>
      </div>

      {images.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-white/15 text-gray-400">
          Paste a video frame to get started
        </div>
      ) : (
        <>
        <SessionSummary />
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={images.map((i) => i.id)}
            strategy={rectSortingStrategy}
          >
            <div className="flex flex-wrap gap-3">
              {images.map((image, index) => (
                <Thumbnail
                  key={image.id}
                  image={image}
                  index={index}
                  onOpen={(id) => dispatch(selectImage(id))}
                  onDelete={(id) => dispatch(removeImage(id))}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        </>
      )}
    </div>
  );
};
