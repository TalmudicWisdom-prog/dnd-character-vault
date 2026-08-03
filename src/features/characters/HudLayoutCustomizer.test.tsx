import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LayoutCard, LayoutCustomizerList } from "./CharacterSheetPage";
import { defaultSheetLayoutOrder, normalizeSheetModuleVisibility, sheetModuleDefinitions } from "./sheetLayout";

describe("Live HUD layout customizer", () => {
  it("renders every registered module with an accessible visibility control and drag handle", () => {
    const visibility = normalizeSheetModuleVisibility({ notes: false, "soul-reaper": false });
    const markup = renderToStaticMarkup(
      <LayoutCustomizerList
        draggingId={null}
        onDragEnd={vi.fn()}
        onDragMove={vi.fn()}
        onDragStart={vi.fn()}
        onMove={vi.fn()}
        onVisibilityChange={vi.fn()}
        order={[...defaultSheetLayoutOrder]}
        visibility={visibility}
      />,
    );

    expect(markup).toContain('aria-label="Home Screen modules"');
    const escapedLabel = (label: string) => label.replaceAll("&", "&amp;");
    expect(sheetModuleDefinitions.every((module) => markup.includes(`Show ${escapedLabel(module.label)} on Home Screen`))).toBe(true);
    expect(sheetModuleDefinitions.every((module) => markup.includes(`Drag ${escapedLabel(module.label)}`))).toBe(true);
    expect(markup).toContain("Hidden from Home Screen");
    expect(markup.match(/data-layout-card-id=/g)).toHaveLength(sheetModuleDefinitions.length);
  });

  it("removes hidden modules from the Home Screen while leaving visible cards intact", () => {
    const hidden = renderToStaticMarkup(<LayoutCard id="notes" visible={false}><p>Private notes remain stored</p></LayoutCard>);
    const visible = renderToStaticMarkup(<LayoutCard id="notes" visible><p>Private notes remain stored</p></LayoutCard>);

    expect(hidden).toBe("");
    expect(visible).toContain('data-layout-card-id="notes"');
    expect(visible).toContain("Private notes remain stored");
  });
});
