import {
  Popover,
  PopoverButton,
  PopoverPanel,
} from "@headlessui/react";
import {
  Bars3Icon,
  PlusIcon,
  TrashIcon,
  PhotoIcon,
  ArrowUpTrayIcon,
} from "@heroicons/react/24/outline";
import { useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  selectSessions,
  createSession,
  deleteSession,
  setCurrentSession,
  importSession,
} from "../store/sessionsSlice";

export const SessionsMenu = () => {
  const dispatch = useDispatch();
  const sessions = useSelector(selectSessions);
  const currentId = useSelector((s) => s.sessions.currentSessionId);
  const fileInput = useRef(null);

  // Newest first.
  const ordered = [...sessions].sort((a, b) => b.createdAt - a.createdAt);

  async function handleImport(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-importing the same file
    if (!file) return;
    try {
      const session = JSON.parse(await file.text());
      dispatch(importSession(session));
    } catch (err) {
      console.warn("Could not import session:", err);
      alert("That file isn't a valid session JSON.");
    }
  }

  return (
    <Popover className="relative">
      <PopoverButton className="relative rounded-full p-1 text-gray-400 hover:text-white focus:outline-2 focus:outline-offset-2 focus:outline-indigo-500">
        <span className="sr-only">Open sessions menu</span>
        <Bars3Icon aria-hidden="true" className="size-6" />
      </PopoverButton>

      <PopoverPanel className="absolute right-0 z-50 mt-2 w-80 origin-top-right rounded-lg border border-white/10 bg-gray-800 shadow-xl">
        {({ close }) => (
          <div className="p-2">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-sm font-semibold text-white">Sessions</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  title="Import session JSON"
                  className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-gray-200 hover:bg-white/20"
                >
                  <ArrowUpTrayIcon className="size-4" />
                  Import
                </button>
                <button
                  type="button"
                  onClick={() => {
                    dispatch(createSession());
                    close();
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-indigo-500 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-400"
                >
                  <PlusIcon className="size-4" />
                  New
                </button>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleImport}
              />
            </div>

            <ul className="mt-1 max-h-96 overflow-auto">
              {ordered.length === 0 && (
                <li className="px-2 py-6 text-center text-sm text-gray-400">
                  No saved sessions yet
                </li>
              )}
              {ordered.map((session) => (
                <li
                  key={session.id}
                  className={`group flex items-center gap-2 rounded-md px-2 py-2 ${
                    session.id === currentId
                      ? "bg-indigo-500/20"
                      : "hover:bg-white/5"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      dispatch(setCurrentSession(session.id));
                      close();
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <PhotoIcon className="size-5 shrink-0 text-gray-400" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-white">
                        {session.name}
                      </span>
                      <span className="block text-xs text-gray-400">
                        {session.images.length} frame
                        {session.images.length === 1 ? "" : "s"}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    title="Delete session"
                    onClick={() => dispatch(deleteSession(session.id))}
                    className="rounded p-1 text-gray-400 opacity-0 transition hover:bg-red-600 hover:text-white focus:opacity-100 group-hover:opacity-100"
                  >
                    <TrashIcon className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </PopoverPanel>
    </Popover>
  );
};
