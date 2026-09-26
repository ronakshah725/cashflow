// Lever definitions: labels, helper notes, and slider bounds.
// These are UI ranges only. Personal default values are never defined here;
// they arrive at runtime from GET /api/defaults.

import type { Assumptions } from "./types";

export type NumericKey = Extract<
  keyof Assumptions,
  | "hisPay"
  | "herPay"
  | "bonusNet"
  | "grossBase"
  | "rent"
  | "housing"
  | "dining"
  | "groceries"
  | "coffee"
  | "other"
  | "travel"
  | "consumables"
  | "formula"
  | "childcareCustom"
  | "medical"
>;

export interface LeverDef {
  /** Assumption field this lever edits. "lifestyle" is virtual (sum of parts). */
  key: NumericKey | "lifestyle";
  label: string;
  note?: string;
  min: number;
  max: number;
  step: number;
  /** Rendered as an annual figure. */
  annual?: boolean;
  /** One-time amount: no /mo suffix on the displayed value. */
  oneTime?: boolean;
  /** Render the number input blank instead of 0 when the value is 0. */
  allowEmpty?: boolean;
}

export const LEVERS: Record<NumericKey, LeverDef> = {
  hisPay: { key: "hisPay", label: "His pay", note: "Take-home", min: 0, max: 20000, step: 50 },
  herPay: { key: "herPay", label: "Her pay", note: "Take-home", min: 0, max: 20000, step: 50 },
  bonusNet: { key: "bonusNet", label: "Bonus, annual net", note: "Confirmed amount received in hand", min: 0, max: 200000, step: 1000, annual: true },
  grossBase: { key: "grossBase", label: "Gross comp, annual", note: "Optional: unlocks the % of gross stat", min: 0, max: 1000000, step: 5000, annual: true, allowEmpty: true },
  rent: { key: "rent", label: "Effective rent", min: 0, max: 12000, step: 50 },
  housing: { key: "housing", label: "Non-rent housing", note: "Utilities, insurance, parking", min: 0, max: 3000, step: 25 },
  dining: { key: "dining", label: "Dining", min: 0, max: 2500, step: 25 },
  groceries: { key: "groceries", label: "Groceries", min: 0, max: 1500, step: 25 },
  coffee: { key: "coffee", label: "Coffee + drinks", min: 0, max: 1000, step: 25 },
  other: { key: "other", label: "Other lifestyle", note: "Catch-all: editing the lifestyle total adjusts this", min: 0, max: 6000, step: 25 },
  travel: { key: "travel", label: "Travel", note: "Annual; spread monthly into investing", min: 0, max: 20000, step: 250, annual: true },
  consumables: { key: "consumables", label: "Baby consumables", note: "Diapers, wipes, formula basics", min: 0, max: 1000, step: 25 },
  formula: { key: "formula", label: "Formula top-up", note: "0 if breastfeeding only", min: 0, max: 1000, step: 25, allowEmpty: true },
  childcareCustom: { key: "childcareCustom", label: "Custom childcare", min: 0, max: 12000, step: 50 },
  medical: { key: "medical", label: "Medical OOP, one time", note: "Planning reserve, not a benefit determination", min: 0, max: 20000, step: 500, oneTime: true },
};

/** Virtual hero lever: the single editable lifestyle number (sum of parts). */
export const LIFESTYLE_TOTAL_LEVER: LeverDef = {
  key: "lifestyle",
  label: "Lifestyle",
  note: "One number; expand for the breakdown",
  min: 0,
  max: 10000,
  step: 25,
};

export const CHILDCARE_CUSTOM_LEVER: LeverDef = LEVERS.childcareCustom;

/** Lifestyle breakdown parts shown in the expandable section. */
export const LIFESTYLE_PARTS: NumericKey[] = ["dining", "groceries", "coffee", "other"];

/** Fine-tune groups: [heading, keys]. */
export const FINE_TUNE_GROUPS: { heading: string; keys: NumericKey[] }[] = [
  { heading: "Income details", keys: ["hisPay", "herPay", "bonusNet", "grossBase"] },
  { heading: "Housing detail", keys: ["housing"] },
  { heading: "Travel", keys: ["travel"] },
  { heading: "Baby + one-time", keys: ["consumables", "formula", "medical"] },
];
