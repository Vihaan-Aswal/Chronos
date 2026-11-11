import { useState } from "react";

const TAB_POLICY = {
  normal: {
    label: "Normal",
    copy: "Switching tabs is not a violation. Useful for classes that use other tools.",
  },
  strict: {
    label: "Strict",
    copy: "Losing focus is noticed. The student is told before class.",
  },
};

const CLASS_CONTEXT = {
  class: {
    label: "Class",
    copy: "A glance away has room. Time to think, look at notes, take a breath.",
  },
  exam: {
    label: "Exam",
    copy: "Stricter gaze and one-strike disengagement. The teacher still makes every call.",
  },
};

export default function ModeSettings() {
  const [tab, setTab] = useState("normal");
  const [context, setContext] = useState("class");

  return (
    <div className="modes-panel">
      <div className="mode-row">
        <div className="mode-copy">
          <h3>Tab policy</h3>
          <p aria-live="polite">{TAB_POLICY[tab].copy}</p>
        </div>
        <div className="segmented" role="group" aria-label="Tab policy">
          {Object.entries(TAB_POLICY).map(([key, value]) => (
            <button
              key={key}
              type="button"
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
            >
              {value.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mode-row">
        <div className="mode-copy">
          <h3>Class context</h3>
          <p aria-live="polite">{CLASS_CONTEXT[context].copy}</p>
        </div>
        <div className="segmented" role="group" aria-label="Class context">
          {Object.entries(CLASS_CONTEXT).map(([key, value]) => (
            <button
              key={key}
              type="button"
              aria-pressed={context === key}
              onClick={() => setContext(key)}
            >
              {value.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mode-summary">
        In force: <b>{TAB_POLICY[tab].label}</b> tab ·{" "}
        <b>{CLASS_CONTEXT[context].label}</b> context.
      </p>
    </div>
  );
}
