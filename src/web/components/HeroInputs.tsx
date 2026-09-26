import { money } from "../lib/calc";
import {
  LEVERS,
  LIFESTYLE_PARTS,
  LIFESTYLE_TOTAL_LEVER,
  type NumericKey,
} from "../lib/levers";
import type { Assumptions, ChildcareOption } from "../lib/types";
import { InfoTip } from "./InfoTip";
import { MoneyControl } from "./MoneyControl";

interface Props {
  a: Assumptions;
  options: ChildcareOption[];
  onPatch: (patch: Partial<Assumptions>) => void;
}

export function HeroInputs({ a, options, onPatch }: Props) {
  const set = <K extends keyof Assumptions>(key: K, value: Assumptions[K]) =>
    onPatch({ [key]: value } as Partial<Assumptions>);

  const parts = a.dining + a.groceries + a.coffee;
  const lifestyleTotal = parts + a.other;
  const setLifestyleTotal = (v: number) =>
    set("other", Math.max(0, Math.round(v - parts)));

  const setNum = (key: NumericKey) => (v: number) => set(key, v);

  return (
    <section className="card hero" aria-label="Key inputs">
      <div className="card-head">
        <span className="head-title">
          <h2>Your levers</h2>
          <InfoTip
            label="About these inputs"
            text="The five numbers that move the answer most. Drag, type, or tap; the verdict updates instantly. Everything else lives under Fine-tune below."
          />
        </span>
      </div>
      <div className="control-list">
        <MoneyControl
          def={LEVERS.rent}
          value={a.rent}
          onChange={setNum("rent")}
        />

        <div className="control select-control">
          <label htmlFor="childcare">
            Childcare plan
            <span className="label-note">Highest-weight decision</span>
          </label>
          <select
            id="childcare"
            value={a.childcare}
            onChange={(e) => set("childcare", e.target.value)}
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
                {o.amount !== null ? ` \u00b7 ${money(o.amount)}/mo` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="bonus-toggle">
          <label htmlFor="includeBonus">
            Include bonus in investing
            <span className="label-note">
              {money(a.bonusNet)}/yr net, spread monthly
            </span>
          </label>
          <span className="switch">
            <input
              id="includeBonus"
              type="checkbox"
              role="switch"
              checked={a.includeBonus}
              onChange={(e) => set("includeBonus", e.target.checked)}
            />
          </span>
        </div>

        <div className="control select-control">
          <label htmlFor="startMonth">
            Baby costs begin
            <span className="label-note">After parental leave</span>
          </label>
          <input
            className="date-input"
            id="startMonth"
            type="month"
            min="2027-01"
            max="2028-12"
            value={a.startMonth}
            onChange={(e) => set("startMonth", e.target.value)}
          />
        </div>

        <MoneyControl
          def={LIFESTYLE_TOTAL_LEVER}
          value={lifestyleTotal}
          onChange={setLifestyleTotal}
        />
        <details className="breakdown">
          <summary>Lifestyle breakdown</summary>
          <div className="control-list">
            {LIFESTYLE_PARTS.map((k) => (
              <MoneyControl
                key={k}
                def={LEVERS[k]}
                value={a[k]}
                onChange={setNum(k)}
              />
            ))}
          </div>
        </details>
      </div>
    </section>
  );
}
