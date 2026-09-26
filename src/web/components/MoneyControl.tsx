import { money } from "../lib/calc";
import type { LeverDef } from "../lib/levers";

interface Props {
  def: LeverDef;
  value: number;
  onChange: (v: number) => void;
}

function suffix(def: LeverDef): string {
  if (def.annual) return "/yr";
  if (def.oneTime) return "";
  return "/mo";
}

export function MoneyControl({ def, value, onChange }: Props) {
  const id = def.key;
  const clamp = (v: number) =>
    Math.min(def.max, Math.max(def.min, Number.isFinite(v) ? v : 0));

  return (
    <div className="control">
      <label htmlFor={id}>
        {def.label}
        {def.note && <span className="label-note">{def.note}</span>}
      </label>
      <input
        className="range"
        id={`${id}Range`}
        type="range"
        min={def.min}
        max={def.max}
        step={def.step}
        value={clamp(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${def.label} slider`}
      />
      <div className="money-wrap">
        <input
          className="money-input"
          id={id}
          type="number"
          min={def.min}
          step={def.step}
          value={def.allowEmpty && value === 0 ? "" : value}
          placeholder={def.allowEmpty ? "Enter" : undefined}
          onChange={(e) => {
            const raw = parseFloat(e.target.value);
            onChange(Number.isFinite(raw) ? Math.max(0, raw) : 0);
          }}
        />
      </div>
      <span className="sr-only" aria-live="polite">
        {money(value)}
        {suffix(def)}
      </span>
    </div>
  );
}
