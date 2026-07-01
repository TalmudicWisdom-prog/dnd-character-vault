import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { SheetNavigatorSection } from "./sheetLayout";
import { sheetNavigatorSectionForTarget } from "./sheetLayout";

const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type SheetNavigatorProps = {
  onNavigate: (section: SheetNavigatorSection) => void;
  sections: SheetNavigatorSection[];
};

export function SheetNavigator({ onNavigate, sections }: SheetNavigatorProps) {
  const [open, setOpen] = useState(false);
  const [activeTargetId, setActiveTargetId] = useState(sections[0]?.targetId ?? "");
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  const activeSection = useMemo(
    () => sections.find((section) => section.targetId === activeTargetId) ?? sheetNavigatorSectionForTarget(activeTargetId),
    [activeTargetId, sections],
  );

  useEffect(() => {
    let frame = 0;
    const updateActiveSection = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const candidates = sections
          .map((section) => {
            const element = document.getElementById(section.targetId);
            if (!element) return null;
            return { section, top: element.getBoundingClientRect().top };
          })
          .filter((candidate): candidate is { section: SheetNavigatorSection; top: number } => Boolean(candidate));
        if (!candidates.length) return;

        const headerOffset = 96;
        const nearest = candidates.reduce((best, candidate) => {
          const distance = Math.abs(candidate.top - headerOffset);
          const bestDistance = Math.abs(best.top - headerOffset);
          return distance < bestDistance ? candidate : best;
        });
        setActiveTargetId(nearest.section.targetId);
      });
    };

    updateActiveSection();
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, [sections]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const firstButton = dialogRef.current?.querySelector<HTMLElement>(focusableSelector);
    firstButton?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus();
    };
  }, [open]);

  const close = () => setOpen(false);

  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const selectSection = (section: SheetNavigatorSection) => {
    setActiveTargetId(section.targetId);
    close();
    onNavigate(section);
  };

  return (
    <>
      <div className="sheet-navigator-bar" aria-label="Current character sheet section">
        <div>
          <span className="card-label">Current section</span>
          <strong>{activeSection.label}</strong>
        </div>
        <button
          aria-expanded={open}
          aria-haspopup="dialog"
          className="sheet-navigator-trigger"
          onClick={() => setOpen(true)}
          ref={openerRef}
          type="button"
        >
          <span aria-hidden="true">Grid</span>
          <span className="sr-only">Open sheet navigator</span>
        </button>
      </div>

      {open && (
        <div className="sheet-navigator-overlay" onMouseDown={close} role="presentation">
          <div
            aria-modal="true"
            aria-labelledby="sheet-navigator-title"
            className="sheet-navigator-modal"
            onKeyDown={trapFocus}
            onMouseDown={(event) => event.stopPropagation()}
            ref={dialogRef}
            role="dialog"
          >
            <div className="module-header">
              <div>
                <span className="card-label">Jump to</span>
                <h2 id="sheet-navigator-title">Sheet Navigator</h2>
              </div>
              <button className="secondary-button compact" onClick={close} type="button">Close</button>
            </div>
            <div className="sheet-navigator-options">
              {sections.map((section) => (
                <button
                  className={section.targetId === activeTargetId ? "sheet-navigator-option active" : "sheet-navigator-option"}
                  key={section.id}
                  onClick={() => selectSection(section)}
                  type="button"
                >
                  {section.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
