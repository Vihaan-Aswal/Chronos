import { useEffect, useState } from "react";

export const MOTION_MEDIA = "(prefers-reduced-motion: reduce)";
export const MOTION_MODES = ["full", "reduced", "off"];

export function readMotionMode() {
  if (typeof document === "undefined") return "full";
  const attr = document.documentElement.dataset.motion;
  if (attr === "full" || attr === "reduced" || attr === "off") return attr;
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
