import { useEffect, useRef, useState } from "react";

/**
 * Small "i" button with a tap/click popover explaining a section in plain
 * language. Works on touch (toggles on tap) and desktop (toggles on click);
 * closes on an outside tap or Escape.
 */
export function InfoTip({ text, label }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span className="info-tip" ref={ref}>
      <button
        type="button"
        className="info-btn"
        aria-label={label ?? "About this section"}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          // Inside a <summary>, stop the details toggle as well.
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        i
      </button>
      {open && (
        <span className="info-pop" role="note">
          {text}
        </span>
      )}
    </span>
  );
}
