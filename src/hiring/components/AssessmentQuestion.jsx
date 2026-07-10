import { Check } from "lucide-react";
import { useId } from "react";

export default function AssessmentQuestion({
  question,
  value,
  saveState,
  disabled = false,
  onSelect
}) {
  const promptId = useId();

  return (
    <section className="assessment-question">
      <p className="assessment-instruction">Choose one answer</p>
      <h1 id={promptId}>{question.prompt}</h1>
      <div
        className="assessment-options"
        role="radiogroup"
        aria-labelledby={promptId}
        aria-busy={saveState === "saving"}
      >
        {question.options.map((option, index) => {
          const selected = value === option.id;
          const saved = selected && saveState === "saved";
          return (
            <label
              className={`assessment-option${selected ? " is-selected" : ""}${saved ? " is-saved" : ""}`}
              key={option.id}
            >
              <input
                type="radio"
                name={`assessment-${question.id}`}
                value={option.id}
                checked={selected}
                disabled={disabled}
                onChange={() => onSelect(question.id, option.id)}
              />
              <span className="assessment-option-marker" aria-hidden="true" />
              <span className="assessment-option-letter" aria-hidden="true">
                {String.fromCharCode(65 + index)}.
              </span>
              <span className="assessment-option-label">{option.label}</span>
              {saved ? (
                <Check className="assessment-option-check" size={23} aria-hidden="true" />
              ) : null}
            </label>
          );
        })}
      </div>
    </section>
  );
}
