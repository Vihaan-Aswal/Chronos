export default function EmptyState({ title, children, action, id }) {
  return (
    <div className="empty" id={id}>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
