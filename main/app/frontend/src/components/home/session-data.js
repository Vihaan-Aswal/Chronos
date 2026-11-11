// Shared illustrative data for the home page's room preview.
// The rules are product truth; the names, counts and minutes are sample data.

export const STATES = [
  {
    key: "attentive",
    label: "Attentive",
    kind: "band",
    range: "Above 0.70",
    rule: "Present and looking at the room. The label is a signal, not a verdict.",
    meta: "Present",
    flag: false,
  },
  {
    key: "distracted",
    label: "Distracted",
    kind: "band",
    range: "0.40 – 0.70",
    rule: "The student gets time and a private nudge before anything else.",
    meta: "4 min in this state",
    flag: false,
  },
  {
    key: "away",
    label: "Away",
    kind: "band",
    range: "Below 0.40",
    rule: "The teacher sees a flag, never an automatic action.",
    meta: "Away for 2 min",
    flag: false,
  },
  {
    key: "disengaged",
    label: "Disengaged",
    kind: "flag",
    range: "Three strikes",
    rule: "The teacher can mark engaged, message, ignore, or remove. Nothing is automatic.",
    meta: "Three strikes",
    flag: true,
  },
  {
    key: "identity",
    label: "Identity mismatch",
    kind: "flag",
    range: "2+ consecutive low-similarity checks",
    rule: "A flag for a human, not a cheating verdict. Checks run every 2–5 minutes.",
    meta: "2 checks unmatched",
    flag: true,
  },
  {
    key: "nodata",
    label: "NO_DATA",
    kind: "flag",
    range: "No face in frame",
    rule: "A camera miss is a camera miss. The student is not punished for it.",
    meta: "No face in frame",
    flag: false,
  },
];

export function labelFor(key) {
  return STATES.find((state) => state.key === key)?.label ?? key;
}

export function stateFor(key) {
  return STATES.find((state) => state.key === key) ?? STATES[0];
}

const historyFor = (state, initials) => {
  if (initials === "R.K.") {
    return Array.from({ length: 20 }, () => "distracted");
  }
  if (state === "attentive") return Array.from({ length: 20 }, () => "attentive");
  if (state === "distracted") {
    return [...Array(4).fill("attentive"), ...Array(16).fill("distracted")];
  }
  if (state === "away") {
    return [...Array(8).fill("distracted"), ...Array(12).fill("away")];
  }
  if (state === "disengaged") {
    return [
      ...Array(3).fill("distracted"),
      ...Array(3).fill("away"),
      ...Array(14).fill("distracted"),
    ];
  }
  if (state === "identity") {
    return [...Array(18).fill("attentive"), "identity", "identity"];
  }
  return [...Array(19).fill("attentive"), "nodata"];
};

// Four rows, front to back. The room reads as a seating plan, not a grid of cards.
const SEAT_ROWS = [
  [
    ["A.B.", "attentive"],
    ["A.M.", "attentive"],
    ["D.S.", "attentive"],
    ["H.K.", "attentive"],
  ],
  [
    ["I.N.", "attentive"],
    ["J.P.", "attentive"],
    ["R.K.", "distracted"],
    ["L.M.", "attentive"],
    ["M.S.", "attentive"],
  ],
  [
    ["N.T.", "attentive"],
    ["P.A.", "attentive"],
    ["S.B.", "attentive"],
    ["S.N.", "nodata"],
    ["T.V.", "distracted"],
    ["U.G.", "away"],
  ],
  [
    ["V.R.", "distracted"],
    ["Y.S.", "away"],
    ["Z.A.", "disengaged"],
    ["A.C.", "identity"],
    ["A.D.", "attentive"],
  ],
];

export const SEATS = SEAT_ROWS.flatMap((row, rowIndex) =>
  row.map(([initials, state], seatIndex) => ({
    initials,
    state,
    row: rowIndex + 1,
    seat: seatIndex + 1,
    history: historyFor(state, initials),
  })),
);

export const ROWS = SEAT_ROWS.map((row, index) => ({
  number: index + 1,
  seats: row.map(([initials]) => initials),
}));

export const TIMELINE = [
  "attentive",
  "attentive",
  "attentive",
  "attentive",
  "attentive",
  "attentive",
  "attentive",
  "distracted",
  "distracted",
  "attentive",
  "attentive",
  "attentive",
  "attentive",
  "attentive",
  "nodata",
  "attentive",
  "attentive",
  "attentive",
  "away",
  "attentive",
];
