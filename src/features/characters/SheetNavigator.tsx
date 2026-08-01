import { useEffect, useMemo, useRef, useState } from "react";
import type { CharacterMenuItem, SheetNavigatorSection } from "./sheetLayout";
import { sheetNavigatorSectionForTarget } from "./sheetLayout";

type SheetNavigatorProps = {
  defaultOpen?: boolean;
  initialActiveTargetId?: string;
  onActiveSectionChange?: (section: SheetNavigatorSection) => void;
  onOpenChange?: (open: boolean) => void;
  onSelect: (item: CharacterMenuItem) => void;
  open?: boolean;
  items: CharacterMenuItem[];
};

export type SheetSectionViewportEntry = {
  isIntersecting: boolean;
  targetId: string;
  top: number;
};

export function nearestVisibleSheetSection(entries: SheetSectionViewportEntry[], anchorTop = 104) {
  const visible = entries.filter((entry) => entry.isIntersecting);
  if (!visible.length) return "";
  return visible.reduce((nearest, entry) => (
    Math.abs(entry.top - anchorTop) < Math.abs(nearest.top - anchorTop) ? entry : nearest
  )).targetId;
}

function focusSheetSectionTrigger() {
  document.querySelector<HTMLButtonElement>(".sheet-section-trigger")?.focus();
}

export function SheetNavigator({
  defaultOpen = false,
  initialActiveTargetId,
  onActiveSectionChange,
  onOpenChange,
  onSelect,
  open: controlledOpen,
  items,
}: SheetNavigatorProps) {
  const sections = useMemo(() => items.filter((item): item is SheetNavigatorSection => item.kind === "section"), [items]);
  const firstTargetId = initialActiveTargetId ?? sections[0]?.targetId ?? "";
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean | ((current: boolean) => boolean)) => {
    const resolved = typeof next === "function" ? next(open) : next;
    if (controlledOpen === undefined) setInternalOpen(resolved);
    onOpenChange?.(resolved);
  };
  const [activeTargetId, setActiveTargetId] = useState(firstTargetId);
  const [isScrolling, setIsScrolling] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef(true);
  const wasOpenRef = useRef(false);
  const scrollStopTimerRef = useRef<number | null>(null);

  const activeSection = useMemo(
    () => sections.find((section) => section.targetId === activeTargetId) ?? sheetNavigatorSectionForTarget(activeTargetId),
    [activeTargetId, sections],
  );

  useEffect(() => {
    onActiveSectionChange?.(activeSection);
  }, [activeSection, onActiveSectionChange]);

  useEffect(() => {
    if (sections.some((section) => section.targetId === activeTargetId)) return;
    setActiveTargetId(sections[0]?.targetId ?? "");
  }, [activeTargetId, sections]);

  useEffect(() => {
    const observed = sections
      .map((section) => ({ element: document.getElementById(section.targetId), section }))
      .filter((entry): entry is { element: HTMLElement; section: SheetNavigatorSection } => entry.element instanceof HTMLElement);
    if (!observed.length) return;

    let frame = 0;
    const updateActiveSection = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const anchorTop = 104;
        const trackingBandBottom = Math.max(220, window.innerHeight * 0.46);
        const candidates = observed.map(({ element, section }) => {
          const rect = element.getBoundingClientRect();
          return {
            isIntersecting: rect.bottom > 72 && rect.top < trackingBandBottom,
            targetId: section.targetId,
            top: rect.top,
          };
        });
        const nextTargetId = nearestVisibleSheetSection(candidates, anchorTop);
        if (nextTargetId) setActiveTargetId(nextTargetId);
      });
    };
    const observer = new IntersectionObserver(() => {
      updateActiveSection();
    }, {
      rootMargin: "-72px 0px -54% 0px",
      threshold: [0, 0.05, 0.25, 0.6],
    });

    observed.forEach(({ element }) => observer.observe(element));
    updateActiveSection();
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, [sections]);

  useEffect(() => {
    const markScrolling = () => {
      setIsScrolling(true);
      if (scrollStopTimerRef.current !== null) window.clearTimeout(scrollStopTimerRef.current);
      scrollStopTimerRef.current = window.setTimeout(() => {
        setIsScrolling(false);
        scrollStopTimerRef.current = null;
      }, 180);
    };
    window.addEventListener("scroll", markScrolling, { passive: true });
    return () => {
      window.removeEventListener("scroll", markScrolling);
      if (scrollStopTimerRef.current !== null) window.clearTimeout(scrollStopTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current && returnFocusRef.current) {
        window.setTimeout(focusSheetSectionTrigger, 0);
      }
      wasOpenRef.current = false;
      return;
    }

    wasOpenRef.current = true;
    returnFocusRef.current = true;
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      returnFocusRef.current = true;
      setOpen(false);
      window.setTimeout(focusSheetSectionTrigger, 0);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const restoreVisibility = () => {
    setIsScrolling(false);
    if (scrollStopTimerRef.current !== null) {
      window.clearTimeout(scrollStopTimerRef.current);
      scrollStopTimerRef.current = null;
    }
  };

  const closeAndReturnFocus = () => {
    returnFocusRef.current = true;
    setOpen(false);
    window.setTimeout(focusSheetSectionTrigger, 0);
  };

  const selectItem = (item: CharacterMenuItem) => {
    returnFocusRef.current = false;
    if (item.kind === "section") setActiveTargetId(item.targetId);
    setOpen(false);
    window.requestAnimationFrame(() => onSelect(item));
  };

  return (
    <>
      <div className={`sheet-section-fab${open ? " open" : ""}${isScrolling && !open ? " is-scrolling" : ""}`}>
        <span className="sr-only" id="sheet-section-current-label">Current section: {activeSection.label}.</span>
        <button
          aria-controls="sheet-section-navigator-panel"
          aria-describedby="sheet-section-current-label"
          aria-expanded={open}
          aria-label="Open character command menu"
          className="sheet-section-trigger"
          onClick={() => {
            restoreVisibility();
            setOpen((current) => !current);
          }}
          onFocus={restoreVisibility}
          onPointerEnter={restoreVisibility}
          type="button"
        >
          <svg aria-hidden="true" className="sheet-section-trigger-icon" viewBox="0 0 24 24">
            <path d="M4 6h2M9 6h11M4 12h2M9 12h11M4 18h2M9 18h11" />
          </svg>
          <span className="sheet-section-trigger-label">{activeSection.shortLabel}</span>
        </button>
      </div>

      {open && (
        <>
          <div
            aria-hidden="true"
            className="sheet-section-dismiss-layer"
            onClick={closeAndReturnFocus}
            onPointerDown={(event) => event.preventDefault()}
          />
          <nav aria-label="Character command menu" className="sheet-section-popover" id="sheet-section-navigator-panel">
            <header className="sheet-section-popover-header">
              <div>
                <span className="card-label">Live-play commands</span>
                <h2>Character Menu</h2>
              </div>
              <button aria-label="Close character sections" className="sheet-section-close" onClick={closeAndReturnFocus} ref={closeButtonRef} type="button">×</button>
            </header>
            <div className="sheet-section-options">
              {items.map((item) => {
                const current = item.kind === "section" && item.targetId === activeTargetId;
                const ariaLabel = current ? `${item.label}, current section` : item.kind === "section" ? `Go to ${item.label}` : `Open ${item.label}`;
                return (
                  <button
                    aria-current={current ? "page" : undefined}
                    aria-label={ariaLabel}
                    className={current ? "sheet-section-option active" : "sheet-section-option"}
                    data-menu-kind={item.kind}
                    data-section-id={item.id}
                    key={item.id}
                    onClick={() => selectItem(item)}
                    type="button"
                  >
                    <span aria-hidden="true" className="sheet-section-option-icon">{item.icon}</span>
                    <span className="sheet-section-option-label">{item.label}</span>
                    {!current && item.kind !== "section" && <span aria-hidden="true" className="sheet-section-action-marker">↗</span>}
                    {current && <span className="sheet-section-current-marker"><span aria-hidden="true">✓</span><span className="sr-only">Current section</span></span>}
                  </button>
                );
              })}
            </div>
          </nav>
        </>
      )}
    </>
  );
}
