import { useLayoutEffect, useState } from "react";
import { useMotionPreference } from "../motion/use-motion-preference.js";

// Device budget for the homepage: saveData removes the authored layers,
// a weak device keeps the arch line but skips the desk wave and light bloom.
export function readMotionBudget() {
  if (typeof navigator === "undefined") return { saveData: false, weak: false };
  const connection =
    navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const saveData = Boolean(connection?.saveData);
  const weak =
    (navigator.hardwareConcurrency ?? 8) <= 4 ||
    (navigator.deviceMemory ?? 8) <= 4;
  return { saveData, weak };
}

export function useMotionBudget() {
  const { mode, reduced, off } = useMotionPreference();
  const [budget] = useState(readMotionBudget);
  return { mode, reduced, off, ...budget };
}

// Arms a one-shot reveal before paint, then fires when the element reaches
// the viewport. Motion off/reduced never arms, so the resting state stays
// visible and no content is ever hidden without a script to reveal it.
export function useRevealOnce(ref, enabled, threshold = 0.3) {
  useLayoutEffect(() => {
    const node = ref.current;
    if (!enabled || !node) return undefined;

    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      return undefined;
    }

    node.classList.add("is-armed");

    let revealed = false;
    let frame = 0;
    let observer;

    const reveal = () => {
      if (revealed) return;
      revealed = true;
      node.classList.add("is-read");
      observer?.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };

    const check = () => {
      frame = 0;
      const box = node.getBoundingClientRect();
      const visible =
        Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0);
      if (box.bottom <= 0 || visible >= box.height * threshold) reveal();
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(check);
    };

    if (!("IntersectionObserver" in window)) {
      reveal();
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) reveal();
        },
        { threshold },
      );
      observer.observe(node);
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
      node.classList.remove("is-armed", "is-read");
    };
  }, [enabled, ref, threshold]);
}
