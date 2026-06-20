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
  ensureDefaultContainers,
  saveInventoryItem,
} from "../../storage/inventory";

type ItemSaveStatus = "saved" | "unsaved" | "saving" | "error";

function InventoryItemCard({
  characterId,
  containers,
  item,
}: {
  characterId: string;
  containers: InventoryContainer[];
  item: InventoryItem;
}) {
  const [draft, setDraft] = useState(item);
  const [status, setStatus] = useState<ItemSaveStatus>("saved");
  const editVersion = useRef(0);

  useEffect(() => {
    if (status === "saved") setDraft(item);
  }, [item, status]);

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

  const edit = <Key extends keyof InventoryItem>(key: Key, value: InventoryItem[Key]) => {
    editVersion.current += 1;
    setDraft((current) => ({ ...current, [key]: value }));
    setStatus("unsaved");
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${draft.name}?`)) return;
    await deleteInventoryItem(characterId, draft.id);
  };

  const statusLabel = status === "saving" ? "Saving locally..." : status === "unsaved" ? "Unsaved changes" : status === "error" ? "Could not save" : "Saved locally";

  return (
    <article className="inventory-item-card">
      <div className="inventory-item-heading">
        <label className="form-field inventory-item-name"><span>Item name</span><input maxLength={200} onChange={(event) => edit("name", event.target.value)} value={draft.name} /></label>
        <div className="item-source-status"><SourceBadge source={draft.source} /><span className={status === "error" ? "save-state error" : "save-state"}>{statusLabel}</span></div>
      </div>

      <div className="inventory-item-flags">
        <label className="touch-toggle"><input checked={draft.equipped} onChange={(event) => edit("equipped", event.target.checked)} type="checkbox" /><span>Equipped</span></label>
        <label className="touch-toggle"><input checked={draft.favorite} onChange={(event) => edit("favorite", event.target.checked)} type="checkbox" /><span>Favorite / important</span></label>
      </div>

      <div className="inventory-fields">
        <label className="form-field"><span>Quantity</span><input min={0} onChange={(event) => edit("quantity", Number(event.target.value))} type="number" value={draft.quantity} /></label>
        <label className="form-field"><span>Category / type</span><input maxLength={100} onChange={(event) => edit("category", event.target.value)} placeholder="Weapon, armor, augmentation..." value={draft.category} /></label>
        <label className="form-field"><span>Rules source</span><select onChange={(event) => edit("source", event.target.value as RulesSource)} value={draft.source}><option value="Manual">Manual</option><option value="Imported PDF">Imported PDF</option><option value="Homebrew">Homebrew</option><option value="SRD">SRD</option></select></label>
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

      <button className="text-button danger inventory-delete" onClick={() => void remove()} type="button">Delete item</button>
    </article>
  );
}

export function InventorySection({ characterId }: { characterId: string }) {
  const containers = useLiveQuery(() => db.inventoryContainers.where("characterId").equals(characterId).sortBy("sortOrder"), [characterId]) ?? [];
  const [selectedContainerId, setSelectedContainerId] = useState("");
  const items = useLiveQuery(
    async (): Promise<InventoryItem[]> => selectedContainerId
      ? db.inventoryItems.where("[characterId+containerId]").equals([characterId, selectedContainerId]).sortBy("updatedAt")
      : [],
    [characterId, selectedContainerId],
  ) ?? [];
  const [newItemName, setNewItemName] = useState("");
  const [newContainerName, setNewContainerName] = useState("");
  const [addingContainer, setAddingContainer] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void ensureDefaultContainers(characterId).catch(() => setMessage("Could not open inventory"));
  }, [characterId]);

  useEffect(() => {
    if (!containers.length) return;
    if (!containers.some((container) => container.id === selectedContainerId)) setSelectedContainerId(containers[0].id);
  }, [containers, selectedContainerId]);

  const addItem = async (event: FormEvent) => {
    event.preventDefault();
    if (!newItemName.trim() || !selectedContainerId) return;
    try {
      await createInventoryItem(characterId, selectedContainerId, newItemName);
      setNewItemName("");
      setMessage("Item stored locally");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create item");
    }
  };

  const addContainer = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const container = await createInventoryContainer(characterId, newContainerName);
      setNewContainerName("");
      setAddingContainer(false);
      setSelectedContainerId(container.id);
      setMessage("Container stored locally");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create container");
    }
  };

  const removeContainer = async () => {
    const selected = containers.find((container) => container.id === selectedContainerId);
    if (!selected || containers.length <= 1 || !window.confirm(`Delete ${selected.name}? Its items will move to another container.`)) return;
    try {
      await deleteInventoryContainer(characterId, selected.id);
      setMessage("Container removed; its items were moved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove container");
    }
  };

  return (
    <article className="panel sheet-section inventory-section">
      <div className="form-section-heading">
        <div><span className="card-label">Character-owned gear</span><h2>Inventory</h2><p>Items, equipment, and custom effects belong only to this character.</p></div>
        {containers.length > 1 && <button className="text-button danger" onClick={() => void removeContainer()} type="button">Delete selected container</button>}
      </div>

      <div className="container-tabs" role="tablist" aria-label="Inventory containers">
        {containers.map((container) => <button aria-selected={selectedContainerId === container.id} className={selectedContainerId === container.id ? "container-tab active" : "container-tab"} data-container-id={container.id} key={container.id} onClick={() => setSelectedContainerId(container.id)} role="tab" type="button">{container.name}</button>)}
        <button className="container-tab add-container-tab" onClick={() => setAddingContainer((current) => !current)} type="button">+ Add Container</button>
      </div>

      {addingContainer && <form className="quick-add-row" onSubmit={(event) => void addContainer(event)}><label className="sr-only" htmlFor={`container-${characterId}`}>Container name</label><input autoFocus id={`container-${characterId}`} maxLength={100} onChange={(event) => setNewContainerName(event.target.value)} placeholder="Custom container name" value={newContainerName} /><button className="primary-button" disabled={!newContainerName.trim()} type="submit">Create container</button></form>}

      <form className="quick-add-row inventory-add-row" onSubmit={(event) => void addItem(event)}>
        <label className="sr-only" htmlFor={`item-${characterId}`}>New item name</label>
        <input id={`item-${characterId}`} maxLength={200} onChange={(event) => setNewItemName(event.target.value)} placeholder="Type an item name..." value={newItemName} />
        <button className="primary-button" disabled={!newItemName.trim() || !selectedContainerId} type="submit">Add item</button>
      </form>
      {message && <p className="inline-message inventory-message" role="status">{message}</p>}

      <div className="inventory-list">
        {items.length ? items.map((item) => <InventoryItemCard characterId={characterId} containers={containers} item={item} key={item.id} />) : <div className="inventory-empty"><strong>This container is empty</strong><span>Add an item manually to begin.</span></div>}
      </div>
    </article>
  );
}
