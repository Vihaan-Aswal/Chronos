export function ActionIconButton({
  title,
  ariaLabel,
  onClick,
  disabled = false,
  variant = "neutral",
  className = "",
  children,
  type = "button",
}) {
  const variantClass = `td-btn-${variant}`;
  return (
    <button
      type={type}
      title={title}
      aria-label={ariaLabel || title}
      onClick={onClick}
      disabled={disabled}
      className={`td-btn td-btn-icon ${variantClass} ${className}`.trim()}
    >
      {children}
    </button>
  );
}

export function MediaControlButton({
  title,
  ariaLabel,
  onClick,
  disabled = false,
  state = "on",
  danger = false,
  children,
}) {
  const stateClass = state === "off" ? "is-off" : "is-on";
  const dangerClass = danger ? "td-btn-danger" : "";

  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel || title}
      onClick={onClick}
      disabled={disabled}
      className={`td-btn td-btn-media ${stateClass} ${dangerClass}`.trim()}
    >
      {children}
    </button>
  );
}
