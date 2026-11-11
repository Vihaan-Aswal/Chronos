const KINDS = {
  attentive: "attentive",
  distracted: "distracted",
  away: "away",
  disengaged: "disengaged",
  identity: "identity",
  nodata: "nodata",
};

export function StateDot({ kind = "attentive" }) {
  return <span className={`dot dot-${KINDS[kind] || "attentive"}`} aria-hidden="true" />;
}

export function StateBadge({ kind = "attentive", children }) {
  const tone =
    kind === "attentive"
      ? "badge-attentive"
      : kind === "distracted"
        ? "badge-distracted"
        : kind === "away"
          ? "badge-away"
          : "badge-flag";
  return (
    <span className={`badge ${tone}`}>
      <StateDot kind={kind} />
      {children}
    </span>
  );
}

export function StateWord({ kind = "attentive", children }) {
  return (
    <span className="row" style={{ gap: 6 }}>
      <StateDot kind={kind} />
      <span>{children}</span>
    </span>
  );
}
