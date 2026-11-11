import { useState } from "react";

const TAB_POLICY = {
  normal: {
    label: "Normal",
    hint: "Tabs can switch",
    copy: "Switching tabs is not a violation. Useful for classes that use other tools.",
  },
  strict: {
    label: "Strict",
    hint: "Focus is noticed",
    copy: "Losing focus is noticed. The student is told before class.",
  },
};

const CLASS_CONTEXT = {
  class: {
    label: "Class",
    hint: "Room to think",
    copy: "A glance away has room. Time to think, look at notes, take a breath.",
  },
  exam: {
    label: "Exam",
    hint: "Stricter gaze",
    copy: "Stricter gaze and one-strike disengagement. The teacher still makes every call.",
  },
};

export default function ModeSettings() {
  const [tab, setTab] = useState("normal");
  const [context, setContext] = useState("class");

  return (
    <div className="settings">
      <div className="setting-row">
        <div className="setting-head">
          <h3>Tab policy</h3>
          <p aria-live="polite">{TAB_POLICY[tab].copy}</p>
        </div>
        <div className="setting-options" role="group" aria-label="Tab policy">
          {Object.entries(TAB_POLICY).map(([key, value]) => (
            <button
              key={key}
              type="button"
              className="setting-option"
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
            >
              <span className="option-name">{value.label}</span>
              <span className="option-hint">{value.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="setting-row">
        <div className="setting-head">
          <h3>Class context</h3>
          <p aria-live="polite">{CLASS_CONTEXT[context].copy}</p>
        </div>
        <div className="setting-options" role="group" aria-label="Class context">
          {Object.entries(CLASS_CONTEXT).map(([key, value]) => (
            <button
              key={key}
              type="button"
              className="setting-option"
              aria-pressed={context === key}
              onClick={() => setContext(key)}
            >
              <span className="option-name">{value.label}</span>
              <span className="option-hint">{value.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="setting-summary">
        In force: <b>{TAB_POLICY[tab].label}</b> tab ·{" "}
        <b>{CLASS_CONTEXT[context].label}</b> context.
        <span> Both are shown to students before they join.</span>
      </p>
    </div>
  );
}
