import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { InventoryContainer, InventoryItem } from "../../domain/models";
import { InventoryItemEditor, InventoryItemRow } from "./InventorySection";

const container = {
  id: "aac077ba-738b-4df1-8c15-3b59de31f9d9",
  characterId: "32ae61a7-9766-499f-88b7-5388d3ed74a0",
  name: "Main Inventory",
  sortOrder: 0,
  createdAt: "2026-07-25T12:00:00.000Z",
  updatedAt: "2026-07-25T12:00:00.000Z",
} satisfies InventoryContainer;

const item = {
  id: "9d64369a-d7ab-46f7-8605-a9456b94343c",
  characterId: container.characterId,
  containerId: container.id,
  name: "Staff of the Unkillable Necro God",
  quantity: 2,
  category: "+3 Staff",
  description: "",
  equipped: true,
  favorite: true,
  customRulesText: "",
  effectsAndStats: "",
  source: "Manual",
  createdAt: "2026-07-25T12:00:00.000Z",
  updatedAt: "2026-07-25T12:00:00.000Z",
} satisfies InventoryItem;

describe("inventory creation presentation", () => {
  it("renders a newly created item as a selected, highlighted, editable inventory row", () => {
    const markup = renderToStaticMarkup(
      <InventoryItemRow
        container={container}
        item={item}
        newlyCreated
        onSelect={vi.fn()}
        selected
      />,
    );

    expect(markup).toContain("inventory-item-row selected newly-created");
    expect(markup).toContain("aria-current=\"true\"");
    expect(markup).toContain("Staff of the Unkillable Necro God");
    expect(markup).toContain("+3 Staff · Qty 2");
    expect(markup).toContain("Equipped");
    expect(markup).toContain("Favorite");
    expect(markup).toContain("Main Inventory");
    expect(markup).toContain("Manual");
    expect(markup).toContain("Edit");
  });

  it("clearly identifies edit mode, creation context, autosave, and finishing actions", () => {
    const markup = renderToStaticMarkup(
      <InventoryItemEditor
        characterId={container.characterId}
        containers={[container]}
        isNewlyCreated
        item={item}
        onAddAnother={vi.fn()}
        onDeleted={vi.fn()}
        onDone={vi.fn()}
        onDuplicated={vi.fn()}
      />,
    );

    expect(markup).toContain("Editing: Staff of the Unkillable Necro God");
    expect(markup).toContain("Added to Main Inventory");
    expect(markup).toContain("Changes save automatically");
    expect(markup).toContain("Saved locally");
    expect(markup).toContain(">Done<");
    expect(markup).toContain(">Duplicate<");
    expect(markup).toContain(">Delete Item<");
    expect(markup).toContain(">+ Add Another Item<");
    expect(markup).not.toContain(">Add Item<");
  });
});
