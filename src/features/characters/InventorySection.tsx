import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { SourceBadge } from "../../components/SourceBadge";
import type { InventoryContainer, InventoryItem, RulesSource } from "../../domain/models";
import { db } from "../../storage/database";
import {
  createInventoryContainer,
  createInventoryItem,
  deleteInventoryContainer,
  deleteInventoryItem,
  duplicateInventoryItem,
  ensureDefaultContainers,
  saveInventoryItem,
} from "../../storage/inventory";
import {
  canSubmitInventoryItem,
  inventoryCreationFailure,
  inventoryCreationSuccess,
  inventorySaveStatusLabel,
  type InventorySaveStatus,
} from "./inventoryWorkflow";

export function InventoryItemRow({
  container,
  item,
  newlyCreated,
  onSelect,
  selected,
}: {
  container: InventoryContainer | undefined;
  item: InventoryItem;
  newlyCreated: boolean;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <button
      aria-current={selected ? "true" : undefined}
      className={`inventory-item-row${selected ? " selected" : ""}${newlyCreated ? " newly-created" : ""}`}
      data-item-id={item.id}
      onClick={onSelect}
      type="button"
    >
      <span className="inventory-row-main">
        <span className="inventory-row-title"><strong>{item.name}</strong><SourceBadge source={item.source} /></span>
        <span className="inventory-row-summary">{item.category || "Uncategorized item"} · Qty {item.quantity}</span>
        <span className="inventory-row-flags">
          <small className={item.equipped ? "active" : ""}>{item.equipped ? "Equipped" : "Not equipped"}</small>
          <small className={item.favorite ? "active" : ""}>{item.favorite ? "Favorite" : "Not favorite"}</small>
        </span>
      </span>
      <span className="inventory-row-location"><small>Container</small><strong>{container?.name ?? "Unknown container"}</strong></span>
      <span className="inventory-row-edit">Edit <span aria-hidden="true">›</span></span>
    </button>
  );
}

export function InventoryItemEditor({
  characterId,
  containers,
  isNewlyCreated,
  item,
  onAddAnother,
  onDeleted,
  onDone,
  onDuplicated,
}: {
  characterId: string;
  containers: InventoryContainer[];
  isNewlyCreated: boolean;
  item: InventoryItem;
  onAddAnother: () => void;
  onDeleted: () => void;
  onDone: () => void;
  onDuplicated: (item: InventoryItem) => void;
}) {
  const [draft, setDraft] = useState(item);
  const [status, setStatus] = useState<InventorySaveStatus>("saved");
  const [actionError, setActionError] = useState("");
  const editVersion = useRef(0);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const containerName = containers.find((container) => container.id === draft.containerId)?.name ?? "Unknown container";

  useEffect(() => {
    setDraft(item);
    setStatus("saved");
    setActionError("");
    editVersion.current = 0;
  }, [item.id]);

  useEffect(() => {
    if (status === "saved") setDraft(item);
  }, [item, status]);

  useEffect(() => {
    if (isNewlyCreated) window.requestAnimationFrame(() => headingRef.current?.focus());
  }, [isNewlyCreated, item.id]);

  useEffect(() => {
    if (status !== "unsaved") return;
    const timer = window.setTimeout(async () => {
      const version = editVersion.current;
      setStatus("saving");
      try {
        const saved = await saveInventoryItem(draft);
        if (editVersion.current === version) {
          setDraft(saved);
          setStatus("saved");
        } else {
          setStatus("unsaved");
        }
      } catch {
        setStatus("error");
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [draft, status]);

  useEffect(() => {
    const flush = () => {
      if (status !== "unsaved") return;
      setStatus("saving");
      void saveInventoryItem(draft).then((saved) => {
        setDraft(saved);
        setStatus("saved");
      }).catch(() => setStatus("error"));
    };
    window.addEventListener("vault:flush", flush);
    return () => window.removeEventListener("vault:flush", flush);
  }, [draft, status]);

  const edit = <Key extends keyof InventoryItem>(key: Key, value: InventoryItem[Key]) => {
    editVersion.current += 1;
    setDraft((current) => ({ ...current, [key]: value }));
    setStatus("unsaved");
    setActionError("");
  };

  const persistNow = async () => {
    const version = editVersion.current;
    setStatus("saving");
    try {
      const saved = await saveInventoryItem(draft);
      if (editVersion.current === version) {
        setDraft(saved);
        setStatus("saved");
      } else {
        setStatus("unsaved");
      }
      return saved;
    } catch {
      setStatus("error");
      throw new Error("Could not save item");
    }
  };

  const retrySave = async () => {
    setActionError("");
    try {
      await persistNow();
    } catch {
      setActionError("Could not save this item. Try again.");
    }
  };

  const finishEditing = async () => {
    setActionError("");
    try {
      await persistNow();
      onDone();
    } catch {
      setActionError("Could not save this item. Try again before closing the editor.");
    }
  };

  const duplicate = async () => {
    setActionError("");
    try {
      const saved = await persistNow();
      const copy = await duplicateInventoryItem(characterId, saved.id);
      onDuplicated(copy);
    } catch {
      setActionError("Item could not be duplicated. Try again.");
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${draft.name}?`)) return;
    setActionError("");
    try {
      await deleteInventoryItem(characterId, draft.id);
      onDeleted();
    } catch {
      setActionError("Item could not be deleted. Try again.");
    }
  };

  const statusLabel = inventorySaveStatusLabel(status);

  return (
    <article className="inventory-item-card inventory-item-editor" aria-labelledby={`inventory-editor-${draft.id}`}>
      <header className="inventory-editor-heading">
        <div>
          <span className="card-label">Edit existing item</span>
          <h3 id={`inventory-editor-${draft.id}`} ref={headingRef} tabIndex={-1}>Editing: {draft.name}</h3>
          <p>{isNewlyCreated ? `Added to ${containerName}` : containerName} · Changes save automatically</p>
        </div>
        <div className="inventory-save-status" aria-live="polite">
          <span className={status === "error" ? "save-state error" : "save-state"}>{statusLabel}</span>
          {status === "error" && <button className="text-button" onClick={() => void retrySave()} type="button">Retry</button>}
        </div>
      </header>

      <label className="form-field inventory-item-name"><span>Item name</span><input maxLength={200} onChange={(event) => edit("name", event.target.value)} value={draft.name} /></label>

      <div className="inventory-item-flags">
        <label className="touch-toggle"><input checked={draft.equipped} onChange={(event) => edit("equipped", event.target.checked)} type="checkbox" /><span>Equipped</span></label>
        <label className="touch-toggle"><input checked={draft.favorite} onChange={(event) => edit("favorite", event.target.checked)} type="checkbox" /><span>Favorite / important</span></label>
      </div>

      <div className="inventory-fields">
        <label className="form-field"><span>Quantity</span><input min={0} onChange={(event) => edit("quantity", Number(event.target.value))} type="number" value={draft.quantity} /></label>
        <label className="form-field"><span>Category / type</span><input maxLength={100} onChange={(event) => edit("category", event.target.value)} placeholder="Weapon, armor, augmentation..." value={draft.category} /></label>
        <label className="form-field"><span>Rules source</span><select onChange={(event) => edit("source", event.target.value as RulesSource)} value={draft.source}><option value="Manual">Manual</option><option value="Imported PDF">Imported PDF</option><option value="Homebrew">Homebrew / FF</option><option value="SRD">SRD</option></select></label>
        <label className="form-field"><span>Location / container</span><select onChange={(event) => edit("containerId", event.target.value)} value={draft.containerId}>{containers.map((container) => <option key={container.id} value={container.id}>{container.name}</option>)}</select></label>
      </div>

      <details className="inventory-item-details">
        <summary>Notes, rules, and effects</summary>
        <div className="inventory-detail-fields">
          <label className="form-field"><span>Description / notes</span><textarea onChange={(event) => edit("description", event.target.value)} placeholder="Appearance, origin, where it came from..." rows={4} value={draft.description} /></label>
          <label className="form-field"><span>Custom rules text</span><textarea onChange={(event) => edit("customRulesText", event.target.value)} placeholder="Stipulations, conditions, special rules..." rows={5} value={draft.customRulesText} /></label>
          <label className="form-field full-width"><span>Effects / Stats</span><textarea onChange={(event) => edit("effectsAndStats", event.target.value)} placeholder="Granted abilities, bonuses, attunement, charges, recharge, activation cost, damage dice, save DC, restrictions..." rows={7} value={draft.effectsAndStats} /></label>
        </div>
      </details>

      {actionError && <p className="inline-message error-message" role="alert">{actionError}</p>}

      <footer className="inventory-editor-actions">
        <button className="primary-button" onClick={() => void finishEditing()} type="button">Done</button>
        <button className="secondary-button" onClick={() => void duplicate()} type="button">Duplicate</button>
        <button className="secondary-button danger" onClick={() => void remove()} type="button">Delete Item</button>
        <button className="text-button inventory-add-another" onClick={onAddAnother} type="button">+ Add Another Item</button>
      </footer>
    </article>
  );
}

export function InventorySection({ characterId }: { characterId: string }) {
  const containers = useLiveQuery(() => db.inventoryContainers.where("characterId").equals(characterId).sortBy("sortOrder"), [characterId]) ?? [];
  const queriedItems = useLiveQuery(
    () => db.inventoryItems.where("characterId").equals(characterId).toArray(),
    [characterId],
  );
  const allItems = queriedItems ?? [];
  const [selectedContainerId, setSelectedContainerId] = useState("");
  const [quickAddName, setQuickAddName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [newlyCreatedItemId, setNewlyCreatedItemId] = useState("");
  const [creationSuccessMessage, setCreationSuccessMessage] = useState("");
  const [creationErrorMessage, setCreationErrorMessage] = useState("");
  const [newContainerName, setNewContainerName] = useState("");
  const [addingContainer, setAddingContainer] = useState(false);
  const [containerMessage, setContainerMessage] = useState("");
  const quickAddInputRef = useRef<HTMLInputElement | null>(null);
  const creationPendingRef = useRef(false);
  const pendingContainerSelectionRef = useRef("");

  const selectedContainer = containers.find((container) => container.id === selectedContainerId);
  const selectedItem = allItems.find((item) => item.id === selectedItemId);
  const items = allItems
    .filter((item) => item.containerId === selectedContainerId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const duplicateNameCount = quickAddName.trim()
    ? items.filter((item) => item.name.toLocaleLowerCase() === quickAddName.trim().toLocaleLowerCase()).length
    : 0;
  const canAddItem = canSubmitInventoryItem(quickAddName, selectedContainerId, isCreating);

  useEffect(() => {
    void ensureDefaultContainers(characterId).catch(() => setContainerMessage("Could not open inventory"));
  }, [characterId]);

  useEffect(() => {
    if (!containers.length) return;
    const pendingContainerId = pendingContainerSelectionRef.current;
    if (pendingContainerId) {
      if (containers.some((container) => container.id === pendingContainerId)) {
        setSelectedContainerId(pendingContainerId);
        pendingContainerSelectionRef.current = "";
      }
      return;
    }
    const saved = sessionStorage.getItem(`vault:inventory-tab:${characterId}`) ?? "";
    if (saved && containers.some((container) => container.id === saved)) {
      setSelectedContainerId(saved);
      return;
    }
    if (!containers.some((container) => container.id === selectedContainerId)) setSelectedContainerId(containers[0].id);
  }, [containers, selectedContainerId]);

  useEffect(() => {
    if (selectedContainerId) sessionStorage.setItem(`vault:inventory-tab:${characterId}`, selectedContainerId);
  }, [characterId, selectedContainerId]);

  useEffect(() => {
    if (queriedItems && selectedItemId && !queriedItems.some((item) => item.id === selectedItemId)) setSelectedItemId("");
  }, [queriedItems, selectedItemId]);

  useEffect(() => {
    if (!creationSuccessMessage) return;
    const timer = window.setTimeout(() => setCreationSuccessMessage(""), 6500);
    return () => window.clearTimeout(timer);
  }, [creationSuccessMessage]);

  const addItem = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmitInventoryItem(quickAddName, selectedContainerId, creationPendingRef.current)) return;
    creationPendingRef.current = true;
    setIsCreating(true);
    setCreationErrorMessage("");
    const submittedName = quickAddName;
    try {
      const item = await createInventoryItem(characterId, selectedContainerId, submittedName);
      const result = inventoryCreationSuccess(item, selectedContainer?.name ?? "selected container");
      setQuickAddName(result.quickAddName);
      setSelectedItemId(result.selectedItemId);
      setNewlyCreatedItemId(result.newlyCreatedItemId);
      setCreationSuccessMessage(result.message);
    } catch {
      const result = inventoryCreationFailure(submittedName);
      setQuickAddName(result.quickAddName);
      setCreationErrorMessage(result.message);
    } finally {
      creationPendingRef.current = false;
      setIsCreating(false);
    }
  };

  const addAnotherItem = () => {
    setCreationSuccessMessage("");
    quickAddInputRef.current?.scrollIntoView({ behavior: "auto", block: "center" });
    window.requestAnimationFrame(() => quickAddInputRef.current?.focus());
  };

  const addContainer = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const container = await createInventoryContainer(characterId, newContainerName);
      setNewContainerName("");
      setAddingContainer(false);
      pendingContainerSelectionRef.current = container.id;
      setSelectedContainerId(container.id);
      setSelectedItemId("");
      setContainerMessage(`${container.name} created locally.`);
    } catch (error) {
      setContainerMessage(error instanceof Error ? error.message : "Could not create container");
    }
  };

  const selectContainer = (containerId: string) => {
    setSelectedContainerId(containerId);
    if (selectedItem && selectedItem.containerId !== containerId) setSelectedItemId("");
    setCreationErrorMessage("");
  };

  const removeContainer = async () => {
    const selected = containers.find((container) => container.id === selectedContainerId);
    if (!selected || containers.length <= 1 || !window.confirm(`Delete ${selected.name}? Its items will move to another container.`)) return;
    try {
      await deleteInventoryContainer(characterId, selected.id);
      setSelectedItemId("");
      setContainerMessage("Container removed; its items were moved.");
    } catch (error) {
      setContainerMessage(error instanceof Error ? error.message : "Could not remove container");
    }
  };

  const handleDuplicated = (item: InventoryItem) => {
    const containerName = containers.find((container) => container.id === item.containerId)?.name ?? "selected container";
    setSelectedContainerId(item.containerId);
    setSelectedItemId(item.id);
    setNewlyCreatedItemId(item.id);
    setCreationSuccessMessage(`${item.name} added to ${containerName}.`);
  };

  return (
    <article className="panel sheet-section inventory-section">
      <div className="form-section-heading">
        <div><span className="card-label">Character-owned gear</span><h2>Inventory</h2><p>Items, equipment, and custom effects belong only to this character.</p></div>
        {containers.length > 1 && <button className="text-button danger" onClick={() => void removeContainer()} type="button">Delete selected container</button>}
      </div>

      <div className="container-tabs" role="tablist" aria-label="Inventory containers">
        {containers.map((container) => <button aria-selected={selectedContainerId === container.id} className={selectedContainerId === container.id ? "container-tab active" : "container-tab"} data-container-id={container.id} key={container.id} onClick={() => selectContainer(container.id)} role="tab" type="button">{container.name}<small>{allItems.filter((item) => item.containerId === container.id).length}</small></button>)}
        <button className="container-tab add-container-tab" onClick={() => setAddingContainer((current) => !current)} type="button">+ Add Container</button>
      </div>

      {addingContainer && <form className="quick-add-row" onSubmit={(event) => void addContainer(event)}><label className="sr-only" htmlFor={`container-${characterId}`}>Container name</label><input autoFocus id={`container-${characterId}`} maxLength={100} onChange={(event) => setNewContainerName(event.target.value)} placeholder="Custom container name" value={newContainerName} /><button className="primary-button" disabled={!newContainerName.trim()} type="submit">Create Container</button></form>}
      {containerMessage && <p className="inline-message" role="status">{containerMessage}</p>}

      <section className="inventory-create-panel" aria-labelledby={`inventory-add-title-${characterId}`}>
        <div className="inventory-create-heading"><span className="card-label">Create new inventory record</span><h3 id={`inventory-add-title-${characterId}`}>Add an item</h3><p>The item will be created in {selectedContainer?.name ?? "the selected container"} and opened for editing.</p></div>
        <form className="quick-add-row inventory-add-row" onSubmit={(event) => void addItem(event)}>
          <label className="sr-only" htmlFor={`item-${characterId}`}>New item name</label>
          <input
            aria-describedby={`item-help-${characterId}`}
            id={`item-${characterId}`}
            maxLength={200}
            onChange={(event) => {
              setQuickAddName(event.target.value);
              setCreationErrorMessage("");
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }}
            placeholder="Type an item name…"
            ref={quickAddInputRef}
            value={quickAddName}
          />
          <button className="primary-button" disabled={!canAddItem} type="submit">{isCreating ? "Adding…" : "Add Item"}</button>
        </form>
        <small className="inventory-add-help" id={`item-help-${characterId}`}>{quickAddName.trim() ? isCreating ? "Creating one local inventory record…" : "Press Add Item or Enter to create exactly one item." : "Enter an item name to enable Add Item."}</small>
        {duplicateNameCount > 0 && <p className="inventory-duplicate-note">A similarly named item already exists here. Duplicates are allowed.</p>}
        {creationErrorMessage && <p className="inline-message error-message" role="alert">{creationErrorMessage}</p>}
      </section>

      {creationSuccessMessage && <div className="inventory-success-toast" aria-live="polite" role="status"><span aria-hidden="true">✓</span><strong>{creationSuccessMessage}</strong><button aria-label="Dismiss item-added confirmation" onClick={() => setCreationSuccessMessage("")} type="button">×</button></div>}

      <section className="inventory-list-section" aria-labelledby={`inventory-list-title-${characterId}`}>
        <div className="inventory-list-heading"><div><span className="card-label">{selectedContainer?.name ?? "Inventory container"}</span><h3 id={`inventory-list-title-${characterId}`}>Inventory items</h3></div><span>{items.length} {items.length === 1 ? "item" : "items"}</span></div>
        <div className="inventory-list">
          {items.length ? items.map((item) => <InventoryItemRow container={containers.find((container) => container.id === item.containerId)} item={item} key={item.id} newlyCreated={item.id === newlyCreatedItemId} onSelect={() => {
            setSelectedItemId(item.id);
            if (item.id !== newlyCreatedItemId) setNewlyCreatedItemId("");
          }} selected={item.id === selectedItemId} />) : <div className="inventory-empty"><strong>This container is empty</strong><span>Add an item manually to begin.</span></div>}
        </div>
      </section>

      {selectedItem && <InventoryItemEditor
        characterId={characterId}
        containers={containers}
        isNewlyCreated={selectedItem.id === newlyCreatedItemId}
        item={selectedItem}
        key={selectedItem.id}
        onAddAnother={addAnotherItem}
        onDeleted={() => {
          setSelectedItemId("");
          setNewlyCreatedItemId("");
        }}
        onDone={() => {
          setSelectedItemId("");
          setNewlyCreatedItemId("");
        }}
        onDuplicated={handleDuplicated}
      />}
    </article>
  );
}
