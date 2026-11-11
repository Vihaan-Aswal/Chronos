const KIND_BY_LABEL = {
  Attentive: "attentive",
  Distracted: "distracted",
  Away: "away",
  Disengaged: "disengaged",
  "Identity mismatch": "identity",
  "Identity Mismatch": "identity",
  "No data": "nodata",
};

export function kindFor(label, hasRiskFlag) {
  if (hasRiskFlag) return "identity";
  return KIND_BY_LABEL[label] || "attentive";
}
