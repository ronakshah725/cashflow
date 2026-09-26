import { childcareShort, fmtK, verdictWord } from "../lib/calc";

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
    <p className="verdict" aria-live="polite">
      At {fmtK(rent)} rent {context} you invest ~
      {fmtK(total)}/mo{includeBonus ? "" : " cash-flow only"}.{" "}
      {verdictWord(total)}
    </p>
  );
}
