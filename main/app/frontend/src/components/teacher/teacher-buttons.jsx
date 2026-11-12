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
  const classes = [
    "icon-btn",
    state === "off" ? "is-off" : "is-on",
    danger ? "is-danger" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel || title}
      onClick={onClick}
      disabled={disabled}
      className={classes}
    >
      {children}
    </button>
  );
}
