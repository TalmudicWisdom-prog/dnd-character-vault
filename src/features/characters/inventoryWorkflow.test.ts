import { describe, expect, it } from "vitest";
import type { InventoryItem } from "../../domain/models";
import {
  canSubmitInventoryItem,
  inventoryCreationFailure,
  inventoryCreationSuccess,
  inventorySaveStatusLabel,
} from "./inventoryWorkflow";

const item = {
  id: "9d64369a-d7ab-46f7-8605-a9456b94343c",
  characterId: "32ae61a7-9766-499f-88b7-5388d3ed74a0",
  containerId: "aac077ba-738b-4df1-8c15-3b59de31f9d9",
  name: "Staff of the Unkillable Necro God",
  quantity: 1,
  category: "",
  description: "",
  equipped: false,
  favorite: false,
  customRulesText: "",
  effectsAndStats: "",
  source: "Manual",
  createdAt: "2026-07-25T12:00:00.000Z",
  updatedAt: "2026-07-25T12:00:00.000Z",
} satisfies InventoryItem;

describe("inventory creation workflow", () => {
  it("only enables creation for a trimmed name, selected container, and idle operation", () => {
    expect(canSubmitInventoryItem("", item.containerId, false)).toBe(false);
    expect(canSubmitInventoryItem("   ", item.containerId, false)).toBe(false);
    expect(canSubmitInventoryItem("Staff", "", false)).toBe(false);
    expect(canSubmitInventoryItem("Staff", item.containerId, true)).toBe(false);
    expect(canSubmitInventoryItem("  Staff  ", item.containerId, false)).toBe(true);
  });

  it("clears quick add, selects the record, and names the item and container after success", () => {
    expect(inventoryCreationSuccess(item, "Main Inventory")).toEqual({
      quickAddName: "",
      selectedItemId: item.id,
      newlyCreatedItemId: item.id,
      message: "Staff of the Unkillable Necro God added to Main Inventory.",
    });
  });

  it("preserves the submitted name after a failed creation", () => {
    expect(inventoryCreationFailure("Staff of Failure")).toEqual({
      quickAddName: "Staff of Failure",
      message: "Item could not be added. Try again.",
    });
  });

  it("distinguishes pending autosave, persisted edits, and retryable errors", () => {
    expect(inventorySaveStatusLabel("unsaved")).toBe("Saving…");
    expect(inventorySaveStatusLabel("saving")).toBe("Saving…");
    expect(inventorySaveStatusLabel("saved")).toBe("Saved locally");
    expect(inventorySaveStatusLabel("error")).toBe("Could not save — retry");
  });
});
