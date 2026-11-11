import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./icons.jsx";

/**
 * Native <dialog> modal: focus containment, Esc, and inert background come from
 * the platform. Rendered in a portal so it escapes overflow containers.
 */
export default function Modal({
  open,
  onClose,
  title,
  sub,
  children,
  actions,
  labelledBy = "app-dialog-title",
  dismissible = true,
}) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (event) => {
      event.preventDefault();
      if (dismissible) onClose?.();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, [onClose, dismissible]);

  if (!open) return null;

  return createPortal(
    <dialog ref={ref} className="app app-dialog" aria-labelledby={labelledBy}>
      <div className="app-dialog-head">
        <div className="app-dialog-head-row">
          <div>
            <h2 className="app-dialog-title" id={labelledBy}>
              {title}
            </h2>
            {sub && <p className="app-dialog-sub">{sub}</p>}
          </div>
          {dismissible && (
            <button
              type="button"
              className="icon-btn icon-btn-sm"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <CloseIcon />
            </button>
          )}
        </div>
      </div>
      <div className="app-dialog-body">{children}</div>
      {actions && <div className="app-dialog-actions">{actions}</div>}
    </dialog>,
    document.body,
  );
}
