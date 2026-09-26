import { childcareShort, fmtK, verdictWord } from "../lib/calc";

interface Props {
  rent: number;
  childcareId: string;
  total: number;
  includeBonus: boolean;
}

/** One plain-language sentence that updates live with the levers. */
export function Verdict({ rent, childcareId, total, includeBonus }: Props) {
  return (
    <p className="verdict" aria-live="polite">
      At {fmtK(rent)} rent + {childcareShort(childcareId)} you invest ~
      {fmtK(total)}/mo{includeBonus ? "" : " cash-flow only"}.{" "}
      {verdictWord(total)}
    </p>
  );
}
