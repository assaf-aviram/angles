import { createSlice, nanoid } from "@reduxjs/toolkit";

function newSession() {
  const createdAt = Date.now();
  return {
    id: nanoid(),
    createdAt,
    name: new Date(createdAt).toLocaleString(),
    images: [], // { id, src (dataURL), points: [{x, y}] normalized 0..1 }
  };
}

const initialState = {
  sessions: [], // kept in creation order; UI sorts newest-first for display
  currentSessionId: null,
  selectedImageId: null,
  drawMode: false,
};

const findSession = (state, id) => state.sessions.find((s) => s.id === id);
const currentSession = (state) => findSession(state, state.currentSessionId);

export const sessionsSlice = createSlice({
  name: "sessions",
  initialState,
  reducers: {
    createSession: {
      reducer(state, action) {
        state.sessions.push(action.payload);
        state.currentSessionId = action.payload.id;
        state.selectedImageId = null;
        state.drawMode = false;
      },
      prepare() {
        return { payload: newSession() };
      },
    },

    deleteSession(state, action) {
      state.sessions = state.sessions.filter((s) => s.id !== action.payload);
      if (state.currentSessionId === action.payload) {
        state.currentSessionId = state.sessions[0]?.id ?? null;
        state.selectedImageId = null;
        state.drawMode = false;
      }
    },

    setCurrentSession(state, action) {
      state.currentSessionId = action.payload;
      state.selectedImageId = null;
      state.drawMode = false;
    },

    addImage: {
      reducer(state, action) {
        const { image } = action.payload;
        // Lazily create a session on first paste.
        let session = currentSession(state);
        if (!session) {
          session = newSession();
          state.sessions.push(session);
          state.currentSessionId = session.id;
        }
        session.images.push(image);
      },
      prepare({ src, width, height }) {
        return {
          payload: {
            image: {
              id: nanoid(),
              src,
              width,
              height,
              points: [],
              mainPointIndex: null, // null -> first computable angle
            },
          },
        };
      },
    },

    removeImage(state, action) {
      const session = currentSession(state);
      if (!session) return;
      session.images = session.images.filter((i) => i.id !== action.payload);
      if (state.selectedImageId === action.payload) {
        state.selectedImageId = null;
        state.drawMode = false;
      }
    },

    reorderImages(state, action) {
      const { fromIndex, toIndex } = action.payload;
      const session = currentSession(state);
      if (!session) return;
      const [moved] = session.images.splice(fromIndex, 1);
      session.images.splice(toIndex, 0, moved);
    },

    selectImage(state, action) {
      state.selectedImageId = action.payload;
      state.drawMode = false;
    },

    closeImage(state) {
      state.selectedImageId = null;
      state.drawMode = false;
    },

    setDrawMode(state, action) {
      state.drawMode = action.payload;
    },

    saveImagePoints(state, action) {
      const { imageId, points } = action.payload;
      const session = currentSession(state);
      const image = session?.images.find((i) => i.id === imageId);
      if (image) {
        image.points = points;
        // Drop a stale main selection that no longer has neighbors on both sides.
        if (image.mainPointIndex > points.length - 2) {
          image.mainPointIndex = null;
        }
      }
      state.drawMode = false;
    },

    setMainPoint(state, action) {
      const { imageId, pointIndex } = action.payload;
      const session = currentSession(state);
      const image = session?.images.find((i) => i.id === imageId);
      if (image) image.mainPointIndex = pointIndex;
    },

    importSession(state, action) {
      const session = action.payload;
      if (!session?.id || !Array.isArray(session.images)) return;
      // Replace any session with a colliding id, then make it current.
      state.sessions = state.sessions.filter((s) => s.id !== session.id);
      state.sessions.push(session);
      state.currentSessionId = session.id;
      state.selectedImageId = null;
      state.drawMode = false;
    },
  },
});

export const {
  createSession,
  deleteSession,
  setCurrentSession,
  addImage,
  removeImage,
  reorderImages,
  selectImage,
  closeImage,
  setDrawMode,
  saveImagePoints,
  setMainPoint,
  importSession,
} = sessionsSlice.actions;

// Selectors
export const selectSessions = (state) => state.sessions.sessions;
export const selectCurrentSession = (state) =>
  findSession(state.sessions, state.sessions.currentSessionId);
export const selectCurrentImages = (state) =>
  selectCurrentSession(state)?.images ?? [];
export const selectSelectedImage = (state) =>
  selectCurrentImages(state).find(
    (i) => i.id === state.sessions.selectedImageId,
  ) ?? null;
export const selectDrawMode = (state) => state.sessions.drawMode;

export default sessionsSlice.reducer;
