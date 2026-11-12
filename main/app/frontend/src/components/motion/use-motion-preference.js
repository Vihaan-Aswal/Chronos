import { useEffect, useState } from "react";

export const MOTION_MEDIA = "(prefers-reduced-motion: reduce)";
export const MOTION_MODES = ["full", "reduced", "off"];

export function readMotionMode() {
  if (typeof document === "undefined") return "full";
  const attr = document.documentElement.dataset.motion;
  if (attr === "full" || attr === "reduced" || attr === "off") return attr;
  if (typeof window !== "undefined") {
    // The provider applies these before paint; reading them here keeps the
    // first render of a page in step with it.
    const query = new URLSearchParams(window.location.search).get("motion");
    if (MOTION_MODES.includes(query)) return query;
    try {
      const stored = localStorage.getItem("chronos_motion");
      if (MOTION_MODES.includes(stored)) return stored;
    } catch {
      // Private mode / storage blocked.
    }
  }
  if (typeof window !== "undefined" && window.matchMedia?.(MOTION_MEDIA).matches) {
    return "reduced";
  }
  return "full";
}

export function useMotionPreference() {
  const [mode, setMode] = useState(() => readMotionMode());

  useEffect(() => {
    const media = window.matchMedia?.(MOTION_MEDIA);
    const update = () => setMode(readMotionMode());
    media?.addEventListener?.("change", update);
    window.addEventListener("chronos:motionchange", update);
    return () => {
      media?.removeEventListener?.("change", update);
      window.removeEventListener("chronos:motionchange", update);
    };
  }, []);

  return {
    mode,
    reduced: mode !== "full",
    off: mode === "off",
  };
}
