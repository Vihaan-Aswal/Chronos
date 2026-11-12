const KIND_BY_LABEL = {
  Stable: "attentive",
  Attentive: "attentive",
  Monitor: "distracted",
  "Self-recovery": "distracted",
  Distracted: "distracted",
  Away: "away",
  "Action required": "disengaged",
  Disengaged: "disengaged",
  "Identity review": "identity",
  "Identity mismatch": "identity",
  "Identity Mismatch": "identity",
  "No data": "nodata",
};

export function kindFor(label, hasRiskFlag) {
  if (hasRiskFlag) return "identity";
  return KIND_BY_LABEL[label] || "attentive";
}
