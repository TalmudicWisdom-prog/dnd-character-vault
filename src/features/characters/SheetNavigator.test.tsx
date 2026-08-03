import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { nearestVisibleSheetSection, SheetNavigator } from "./SheetNavigator";
import { characterMenuItems, sheetModuleDefinitions, sheetNavigatorSections } from "./sheetLayout";

describe("floating character section navigator", () => {
  it("renders a floating accessible trigger without the old Current Section card or GRID control", () => {
    const markup = renderToStaticMarkup(<SheetNavigator items={characterMenuItems} onSelect={vi.fn()} />);

    expect(markup).toContain("sheet-section-fab");
    expect(markup).toContain('aria-label="Open character command menu"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("Current section: Dashboard.");
    expect(markup).not.toContain("sheet-navigator-bar");
    expect(markup).not.toContain(">Grid<");
  });

  it("lists the shared section definitions and marks the current section accessibly", () => {
    const dashboard = sheetNavigatorSections.find((section) => section.id === "dashboard")!;
    const markup = renderToStaticMarkup(
      <SheetNavigator
        defaultOpen
        initialActiveTargetId={dashboard.targetId}
        items={characterMenuItems}
        onSelect={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Character command menu"');
    expect(markup).toContain("Character Menu");
    expect(markup.match(/class="sheet-section-option(?: active)?"/g)).toHaveLength(characterMenuItems.length);
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("Dashboard, current section");
    expect(characterMenuItems.every((item) => markup.includes(`data-section-id="${item.id}"`))).toBe(true);
  });

  it("renders direct destinations as buttons with explicit action or route semantics", () => {
    const markup = renderToStaticMarkup(<SheetNavigator defaultOpen items={characterMenuItems} onSelect={vi.fn()} />);

    expect(markup).toContain('aria-label="Open Dice Roller"');
    expect(markup).toContain('aria-label="Open Spellbook"');
    expect(markup).toContain('aria-label="Open Inventory"');
    expect(markup).toContain('aria-label="Open Profile"');
    expect(markup).toContain('aria-label="Open Export Character"');
    expect(markup).toContain('aria-label="Open Edit Portrait"');
    expect(markup).toContain('aria-label="Open Ability Scores"');
    expect(markup).toContain('aria-label="Open Conditions"');
    expect(markup).toContain('data-menu-kind="action"');
    expect(markup).toContain('data-menu-kind="route"');
    expect(markup).toContain('data-menu-kind="section"');
  });

  it("always lists every HUD module regardless of Home Screen visibility", () => {
    const markup = renderToStaticMarkup(<SheetNavigator defaultOpen items={characterMenuItems} onSelect={vi.fn()} />);
    expect(sheetModuleDefinitions.every((module) => markup.includes(`data-section-id="${module.menu.id}"`))).toBe(true);
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
