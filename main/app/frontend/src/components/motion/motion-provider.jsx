import { useLayoutEffect } from "react";
import { MOTION_MODES, readMotionMode } from "./use-motion-preference.js";

const STORAGE_KEY = "chronos_motion";

function safeReadStoredMode() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function safeStoreMode(mode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Private mode / storage blocked: the switch still works for this session.
  }
}

/**
 * Applies the global motion switch and page-visibility pause before paint.
 * Renders nothing; the app pages and the portal dialogs are scoped by .app.
 */
export default function MotionProvider({ children }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const params = new URLSearchParams(window.location.search);
    const queryMode = params.get("motion");
    const requested = queryMode || safeReadStoredMode();

    if (MOTION_MODES.includes(requested)) {
      root.dataset.motion = requested;
      if (MOTION_MODES.includes(queryMode)) safeStoreMode(queryMode);
    } else {
      delete root.dataset.motion;
    }

    const setMode = (mode) => {
      if (!MOTION_MODES.includes(mode)) return;
      root.dataset.motion = mode;
      safeStoreMode(mode);
      window.dispatchEvent(new Event("chronos:motionchange"));
    };

    window.chronosMotion = {
      get: () => readMotionMode(),
      set: setMode,
      off: () => setMode("off"),
      reduced: () => setMode("reduced"),
      full: () => setMode("full"),
    };

    const onVisibility = () => {
      root.dataset.hidden = document.hidden ? "true" : "false";
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      delete window.chronosMotion;
    };
  }, []);

  return children;
}
