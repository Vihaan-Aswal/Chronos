import { createPortal } from "react-dom";

function NudgeNotification({ message }) {
  if (!message) return null;

  return createPortal(
    <div 
      className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-6 py-4 rounded-2xl shadow-2xl z-[99999] pointer-events-none animate-nudge-slide-in border border-slate-600/50"
      style={{ 
        position: "fixed",
        zIndex: 99999,
        pointerEvents: "none"
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">🔔</span>
        <span className="font-semibold text-slate-100">{message}</span>
      </div>
    </div>,
    document.body
  );
}

export default NudgeNotification;











