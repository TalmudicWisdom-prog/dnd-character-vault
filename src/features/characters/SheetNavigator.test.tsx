import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { nearestVisibleSheetSection, SheetNavigator } from "./SheetNavigator";
import { sheetNavigatorSections } from "./sheetLayout";

describe("floating character section navigator", () => {
  it("renders a floating accessible trigger without the old Current Section card or GRID control", () => {
    const markup = renderToStaticMarkup(<SheetNavigator onNavigate={vi.fn()} sections={sheetNavigatorSections} />);

    expect(markup).toContain("sheet-section-fab");
    expect(markup).toContain('aria-label="Open character sections"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("Current section: Dashboard.");
    expect(markup).not.toContain("sheet-navigator-bar");
    expect(markup).not.toContain(">Grid<");
  });

  it("lists the shared section definitions and marks the current section accessibly", () => {
    const inventory = sheetNavigatorSections.find((section) => section.id === "inventory")!;
    const markup = renderToStaticMarkup(
      <SheetNavigator
        defaultOpen
        initialActiveTargetId={inventory.targetId}
        onNavigate={vi.fn()}
        sections={sheetNavigatorSections}
      />,
    );

    expect(markup).toContain('aria-label="Character sections"');
    expect(markup).toContain("Character Sections");
    expect(markup.match(/class="sheet-section-option(?: active)?"/g)).toHaveLength(sheetNavigatorSections.length);
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("Inventory, current section");
    expect(sheetNavigatorSections.every((section) => markup.includes(`data-section-id="${section.id}"`))).toBe(true);
  });

  it("chooses the visible section nearest the stable top anchor without boundary flicker", () => {
    expect(nearestVisibleSheetSection([
      { isIntersecting: true, targetId: "sheet-section-dashboard", top: -420 },
      { isIntersecting: true, targetId: "sheet-section-abilities", top: 118 },
      { isIntersecting: false, targetId: "sheet-section-skills", top: 520 },
    ])).toBe("sheet-section-abilities");

    expect(nearestVisibleSheetSection([
      { isIntersecting: false, targetId: "sheet-section-dashboard", top: -600 },
      { isIntersecting: false, targetId: "sheet-section-abilities", top: 600 },
    ])).toBe("");
  });
});
