import { configureStore } from "@reduxjs/toolkit";
import sessionsReducer from "./sessionsSlice";

const STORAGE_KEY = "angles.sessions.v1";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    // Only restore persisted session data; transient UI flags reset on load.
    return {
      sessions: {
        sessions: parsed.sessions ?? [],
        currentSessionId: parsed.currentSessionId ?? null,
        selectedImageId: null,
        drawMode: false,
      },
    };
  } catch {
    return undefined;
  }
}

function saveState(state) {
  try {
    const { sessions, currentSessionId } = state.sessions;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ sessions, currentSessionId }),
    );
  } catch (err) {
    // Most likely QuotaExceededError from large base64 images.
    console.warn("Could not persist sessions to localStorage:", err);
  }
}

export const store = configureStore({
  reducer: { sessions: sessionsReducer },
  preloadedState: loadState(),
});

// Persist on every change. Throttled with rAF so rapid drawing edits coalesce.
let scheduled = false;
store.subscribe(() => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    saveState(store.getState());
  });
});
