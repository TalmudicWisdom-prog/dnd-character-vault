import type { InventoryItem } from "../../domain/models";

export type InventorySaveStatus = "saved" | "unsaved" | "saving" | "error";

export function canSubmitInventoryItem(name: string, selectedContainerId: string, isCreating: boolean) {
  return Boolean(name.trim() && selectedContainerId && !isCreating);
}

export function inventorySaveStatusLabel(status: InventorySaveStatus) {
  if (status === "saved") return "Saved locally";
  if (status === "error") return "Could not save — retry";
  return "Saving…";
}

export function inventoryCreationSuccess(item: InventoryItem, containerName: string) {
  return {
    quickAddName: "",
    selectedItemId: item.id,
    newlyCreatedItemId: item.id,
    message: `${item.name} added to ${containerName}.`,
  };
}

export function inventoryCreationFailure(quickAddName: string) {
  return {
    quickAddName,
    message: "Item could not be added. Try again.",
  };
}
