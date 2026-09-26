import { childcareShort, fmtK, verdictWord } from "../lib/calc";
import { InfoTip } from "./InfoTip";

interface Props {
  rent: number;
  childcareId: string;
  total: number;
  includeBonus: boolean;
  phase: 1 | 2;
}

/** One plain-language sentence that updates live with the levers. */
export function Verdict({ rent, childcareId, total, includeBonus, phase }: Props) {
  const context =
    phase === 1 ? "before childcare starts" : `+ ${childcareShort(childcareId)}`;
  return (
    <div className="verdict-wrap">
      <p className="verdict" aria-live="polite">
        At {fmtK(rent)} rent {context} you invest ~
        {fmtK(total)}/mo{includeBonus ? "" : " cash-flow only"}.{" "}
        {verdictWord(total)}
      </p>
      <InfoTip
        label="About the verdict"
        text="The bottom line: monthly income left to invest after housing, lifestyle, and (in phase 2) baby costs. The bonus toggle adds your annual bonus spread over 12 months."
      />
    </div>
  );
}
