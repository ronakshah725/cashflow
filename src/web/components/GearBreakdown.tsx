import { useState } from "react";
import { gearTotal, money } from "../lib/calc";
import type { Assumptions, GearItem } from "../lib/types";

interface Props {
  a: Assumptions;
  onPatch: (patch: Partial<Assumptions>) => void;
}

let nextId = 0;
function newId() {
  nextId += 1;
  return `custom-${Date.now()}-${nextId}`;
}

/**
 * Itemized baby-gear reserve. The one-time total is the sum of the rows;
 * rows are editable, removable, and addable. Editing any row switches the
 * reserve off the legacy lump-sum `gear` and onto the itemized list.
 */
export function GearBreakdown({ a, onPatch }: Props) {
  const [open, setOpen] = useState(false);
  const items = Array.isArray(a.gearItems) ? a.gearItems : [];

  const setItems = (items: GearItem[]) => onPatch({ gearItems: items });

  const setItem = (id: string, patch: Partial<GearItem>) =>
    setItems(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const removeItem = (id: string) =>
    setItems(items.filter((it) => it.id !== id));

  const addItem = () =>
    setItems([...items, { id: newId(), label: "New item", amount: 0 }]);

  return (
    <div className="gear-breakdown">
      <button
        type="button"
        className="gear-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>Baby gear, itemized</span>
        <strong>{money(gearTotal(a))}</strong>
        <span className="gear-caret" aria-hidden="true">
          {open ? "\u25b4" : "\u25be"}
        </span>
      </button>
      {open && (
        <ul className="gear-items">
          {items.map((it) => (
            <li key={it.id} className="gear-item">
              <input
                className="gear-label"
                type="text"
                value={it.label}
                maxLength={60}
                aria-label="Item name"
                onChange={(e) => setItem(it.id, { label: e.target.value })}
              />
              <div className="money-wrap">
                <input
                  className="money-input gear-amount"
                  type="number"
                  min={0}
                  step={50}
                  value={it.amount}
                  aria-label={`${it.label || "Item"} amount`}
                  onChange={(e) => {
                    const raw = parseFloat(e.target.value);
                    setItem(it.id, {
                      amount: Math.max(0, Number.isFinite(raw) ? raw : 0),
                    });
                  }}
                />
              </div>
              <button
                type="button"
                className="gear-remove"
                aria-label={`Remove ${it.label || "item"}`}
                onClick={() => removeItem(it.id)}
              >
                {"\u00d7"}
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="gear-add" onClick={addItem}>
              + Add item
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
