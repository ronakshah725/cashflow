import { money } from "../lib/calc";
import {
  CHILDCARE_CUSTOM_LEVER,
  FINE_TUNE_GROUPS,
  LEVERS,
  type NumericKey,
} from "../lib/levers";
import type { Assumptions } from "../lib/types";
import { MoneyControl } from "./MoneyControl";

interface Props {
  a: Assumptions;
  onPatch: (patch: Partial<Assumptions>) => void;
  oneTime: {
    broker: number;
    movers: number;
    gear: number;
    medical: number;
    total: number;
  };
}

export function FineTune({ a, onPatch, oneTime }: Props) {
  const setNum = (key: NumericKey) => (v: number) =>
    onPatch({ [key]: v } as Partial<Assumptions>);

  return (
    <details className="card fine-tune">
      <summary>
        <span>
          <strong>Fine-tune</strong>
          <span className="summary-note">Everything else</span>
        </span>
      </summary>
      <div className="fine-tune-body">
        {FINE_TUNE_GROUPS.map((g) => (
          <div className="fine-group" key={g.heading}>
            <h3>{g.heading}</h3>
            <div className="control-list">
              {g.keys.map((k) => (
                <MoneyControl
                  key={k}
                  def={LEVERS[k]}
                  value={a[k]}
                  onChange={setNum(k)}
                />
              ))}
            </div>
          </div>
        ))}
        {a.childcare === "custom" && (
          <div className="fine-group">
            <h3>Custom childcare</h3>
            <div className="control-list">
              <MoneyControl
                def={CHILDCARE_CUSTOM_LEVER}
                value={a.childcareCustom}
                onChange={setNum("childcareCustom")}
              />
            </div>
          </div>
        )}
        <div className="fine-group">
          <h3>One-time reserve</h3>
          <ul className="onetime">
            <li>
              <span>Broker fee, 1 month rent</span>
              <strong>{money(oneTime.broker)}</strong>
            </li>
            <li>
              <span>Movers</span>
              <strong>{money(oneTime.movers)}</strong>
            </li>
            <li>
              <span>Baby gear</span>
              <strong>{money(oneTime.gear)}</strong>
            </li>
            <li>
              <span>Medical OOP reserve</span>
              <strong>{money(oneTime.medical)}</strong>
            </li>
            <li className="total">
              <span>Total one-time</span>
              <strong>{money(oneTime.total)}</strong>
            </li>
          </ul>
        </div>
      </div>
    </details>
  );
}
