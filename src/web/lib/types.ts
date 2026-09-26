// Shared types for the cash-flow calculator.
// NOTE: no default *values* live here. Seeded defaults come from
// GET /api/defaults at runtime (KV key defaults:v1).

export interface ChildcareOption {
  id: string;
  label: string;
  /** Monthly cost, or null for "custom amount" where the user types a value. */
  amount: number | null;
  note: string;
}

/** One line item of the baby-gear reserve. Amounts are seeded from the
 *  (gitignored) defaults JSON, never hardcoded here. */
export interface GearItem {
  id: string;
  label: string;
  amount: number;
}

/** Editable levers. Persisted per user via PUT /api/assumptions. */
export interface Assumptions {
  hisPay: number;
  herPay: number;
  bonusNet: number;
  includeBonus: boolean;
  grossBase: number;
  rent: number;
  housing: number;
  dining: number;
  groceries: number;
  coffee: number;
  other: number;
  /** Annual travel spend, wired into monthly investing as travel/12. */
  travel: number;
  childcare: string;
  childcareCustom: number;
  consumables: number;
  formula: number;
  /** Itemized baby-gear reserve; the one-time total is the sum of amounts. */
  gearItems: GearItem[];
  /**
   * Legacy lump-sum gear reserve. Only used when gearItems is empty/missing
   * (data seeded before the itemized breakdown). New writes use gearItems.
   */
  gear?: number;
  medical: number;
  startMonth: string;
}

/** Full seeded payload: levers plus owner-level constants. */
export interface SeededDefaults extends Assumptions {
  movers: number;
  childcareOptions: ChildcareOption[];
}

export const NUMERIC_KEYS: (keyof Assumptions)[] = [
  "hisPay",
  "herPay",
  "bonusNet",
  "grossBase",
  "rent",
  "housing",
  "dining",
  "groceries",
  "coffee",
  "other",
  "travel",
  "childcareCustom",
  "consumables",
  "formula",
  "medical",
];

/** Empty/zero state used only when no seeded defaults exist yet. */
export const ZERO_ASSUMPTIONS: Assumptions = {
  hisPay: 0,
  herPay: 0,
  bonusNet: 0,
  includeBonus: false,
  grossBase: 0,
  rent: 0,
  housing: 0,
  dining: 0,
  groceries: 0,
  coffee: 0,
  other: 0,
  travel: 0,
  childcare: "none",
  childcareCustom: 0,
  consumables: 0,
  formula: 0,
  gearItems: [],
  medical: 0,
  startMonth: "",
};
