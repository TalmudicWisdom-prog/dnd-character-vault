import type { CharacterSyncBundle } from './CloudSyncProvider';

/** Result of a 3-way merge attempt */
export interface MergeResult {
  /** Whether the merge succeeded without needing user intervention */
  success: boolean;
  /** The merged bundle (if success is true) */
  merged: CharacterSyncBundle | null;
  /** Fields that conflicted and couldn't be auto-merged */
  conflicts: FieldConflict[];
}

export interface FieldConflict {
  /** Dot-path to the conflicting field (e.g., 'character.level', 'sheet.currentHp') */
  path: string;
  /** Value from the ancestor (common base) */
  ancestorValue: unknown;
  /** Value from the local version */
  localValue: unknown;
  /** Value from the remote version */
  remoteValue: unknown;
}

/**
 * Perform a deep equality check between two values.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  
  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!keysB.includes(key) || !deepEqual((a as any)[key], (b as any)[key])) {
      return false;
    }
  }
  return true;
}

function mergeScalarObject(
  base: Record<string, unknown> | null | undefined,
  local: Record<string, unknown> | null | undefined,
  remote: Record<string, unknown> | null | undefined,
  pathPrefix: string
): { merged: Record<string, unknown> | null; conflicts: FieldConflict[] } {
  if (!base && !local && !remote) return { merged: null, conflicts: [] };

  if (base && !local && remote) {
    if (deepEqual(base, remote)) return { merged: null, conflicts: [] };
    return {
      merged: remote,
      conflicts: [{ path: pathPrefix, ancestorValue: base, localValue: null, remoteValue: remote }]
    };
  }
  if (base && !remote && local) {
    if (deepEqual(base, local)) return { merged: null, conflicts: [] };
    return {
      merged: local,
      conflicts: [{ path: pathPrefix, ancestorValue: base, localValue: local, remoteValue: null }]
    };
  }
  
  if (!local && !remote) return { merged: null, conflicts: [] };
  
  if (!local) return { merged: remote || null, conflicts: [] };
  if (!remote) return { merged: local || null, conflicts: [] };

  const result: Record<string, unknown> = {};
  const conflicts: FieldConflict[] = [];

  const safeBase = base || {};
  const allKeys = new Set([...Object.keys(safeBase), ...Object.keys(local), ...Object.keys(remote)]);

  for (const key of allKeys) {
    const bVal = safeBase[key];
    const lVal = local[key];
    const rVal = remote[key];
    const fullPath = pathPrefix ? `${pathPrefix}.${key}` : key;

    const lChanged = !deepEqual(bVal, lVal);
    const rChanged = !deepEqual(bVal, rVal);

    if (!lChanged && !rChanged) {
      if (lVal !== undefined) result[key] = lVal;
    } else if (lChanged && !rChanged) {
      if (lVal !== undefined) result[key] = lVal;
    } else if (!lChanged && rChanged) {
      if (rVal !== undefined) result[key] = rVal;
    } else {
      if (deepEqual(lVal, rVal)) {
        if (lVal !== undefined) result[key] = lVal;
      } else {
        conflicts.push({
          path: fullPath,
          ancestorValue: bVal,
          localValue: lVal,
          remoteValue: rVal
        });
        if (lVal !== undefined) result[key] = lVal;
      }
    }
  }

  return { merged: result, conflicts };
}

function mergeEntityArray(
  base: Record<string, unknown>[],
  local: Record<string, unknown>[],
  remote: Record<string, unknown>[],
  pathPrefix: string
): { merged: Record<string, unknown>[]; conflicts: FieldConflict[] } {
  const baseMap = new Map(base.map(item => [String(item.id), item]));
  const localMap = new Map(local.map(item => [String(item.id), item]));
  const remoteMap = new Map(remote.map(item => [String(item.id), item]));

  const allIds = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);

  const merged: Record<string, unknown>[] = [];
  const conflicts: FieldConflict[] = [];

  for (const id of allIds) {
    const b = baseMap.get(id);
    const l = localMap.get(id);
    const r = remoteMap.get(id);
    const itemPath = `${pathPrefix}[id=${id}]`;

    if (!b) {
      if (l && !r) merged.push(l);
      else if (!l && r) merged.push(r);
      else if (l && r) {
        const { merged: mObj, conflicts: mConflicts } = mergeScalarObject(undefined, l, r, itemPath);
        if (mObj) merged.push(mObj);
        conflicts.push(...mConflicts);
      }
    } else {
      if (!l && !r) {
        // Deleted in both
      } else if (!l && r) {
        if (!deepEqual(b, r)) {
          conflicts.push({ path: itemPath, ancestorValue: b, localValue: null, remoteValue: r });
          merged.push(r);
        }
      } else if (l && !r) {
        if (!deepEqual(b, l)) {
          conflicts.push({ path: itemPath, ancestorValue: b, localValue: l, remoteValue: null });
          merged.push(l);
        }
      } else if (l && r) {
        const { merged: mObj, conflicts: mConflicts } = mergeScalarObject(b, l, r, itemPath);
        if (mObj) merged.push(mObj);
        conflicts.push(...mConflicts);
      }
    }
  }

  return { merged, conflicts };
}

function mergeTombstones(base: any[], local: any[], remote: any[]): any[] {
  const map = new Map();
  for (const t of [...base, ...local, ...remote]) {
    if (t && t.id) map.set(t.id, t);
  }
  return Array.from(map.values());
}

/**
 * Perform a 3-way merge between local, remote, and ancestor versions.
 * 
 * Algorithm:
 * 1. For each field in the bundle, compare local vs ancestor and remote vs ancestor
 * 2. If only local changed: keep local value
 * 3. If only remote changed: keep remote value
 * 4. If both changed to the SAME value: keep that value (convergent)
 * 5. If both changed to DIFFERENT values: record as conflict
 * 
 * For sub-entity arrays (inventory items, spells, etc.):
 * - Items present in local but not ancestor: local additions -> keep
 * - Items present in remote but not ancestor: remote additions -> keep
 * - Items present in ancestor but not local: local deletions -> remove
 * - Items present in ancestor but not remote: remote deletions -> remove
 * - Items modified on both sides: field-level merge on individual items by ID
 */
export function threeWayMerge(
  ancestor: CharacterSyncBundle,
  local: CharacterSyncBundle,
  remote: CharacterSyncBundle,
): MergeResult {
  const conflicts: FieldConflict[] = [];

  const { merged: mergedCharacter, conflicts: charConflicts } = mergeScalarObject(ancestor.character, local.character, remote.character, 'character');
  conflicts.push(...charConflicts);

  const { merged: mergedSheet, conflicts: sheetConflicts } = mergeScalarObject(ancestor.sheet, local.sheet, remote.sheet, 'sheet');
  conflicts.push(...sheetConflicts);

  const { merged: mergedSpellbook, conflicts: sbConflicts } = mergeScalarObject(ancestor.spellbook, local.spellbook, remote.spellbook, 'spellbook');
  conflicts.push(...sbConflicts);

  const { merged: mergedSoulReaper, conflicts: srConflicts } = mergeScalarObject(ancestor.soulReaperProgression, local.soulReaperProgression, remote.soulReaperProgression, 'soulReaperProgression');
  conflicts.push(...srConflicts);

  const { merged: mergedContainers, conflicts: contConflicts } = mergeEntityArray(ancestor.inventory.containers, local.inventory.containers, remote.inventory.containers, 'inventory.containers');
  conflicts.push(...contConflicts);

  const { merged: mergedItems, conflicts: itemConflicts } = mergeEntityArray(ancestor.inventory.items, local.inventory.items, remote.inventory.items, 'inventory.items');
  conflicts.push(...itemConflicts);

  const { merged: mergedSpells, conflicts: spellConflicts } = mergeEntityArray(ancestor.spells, local.spells, remote.spells, 'spells');
  conflicts.push(...spellConflicts);

  const { merged: mergedDocs, conflicts: docConflicts } = mergeEntityArray(ancestor.pdfDocuments, local.pdfDocuments, remote.pdfDocuments, 'pdfDocuments');
  conflicts.push(...docConflicts);

  const { merged: mergedBookmarks, conflicts: bmConflicts } = mergeEntityArray(ancestor.pdfBookmarks, local.pdfBookmarks, remote.pdfBookmarks, 'pdfBookmarks');
  conflicts.push(...bmConflicts);

  const mergedPortrait = {
    assetHash: local.portrait.assetHash,
    transform: local.portrait.transform
  };
  
  const bHash = ancestor.portrait.assetHash;
  const lHash = local.portrait.assetHash;
  const rHash = remote.portrait.assetHash;
  const lHashChanged = bHash !== lHash;
  const rHashChanged = bHash !== rHash;

  if (!lHashChanged && rHashChanged) {
    mergedPortrait.assetHash = rHash;
  } else if (lHashChanged && rHashChanged && lHash !== rHash) {
    conflicts.push({
      path: 'portrait.assetHash',
      ancestorValue: bHash,
      localValue: lHash,
      remoteValue: rHash
    });
  }

  const { merged: mergedTransform, conflicts: transConflicts } = mergeScalarObject(
    ancestor.portrait.transform as Record<string, unknown>,
    local.portrait.transform as Record<string, unknown>,
    remote.portrait.transform as Record<string, unknown>,
    'portrait.transform'
  );
  conflicts.push(...transConflicts);
  mergedPortrait.transform = (mergedTransform || {}) as any;

  const mergedTombstones = mergeTombstones(ancestor.tombstones || [], local.tombstones || [], remote.tombstones || []);

  const mergedBundle: CharacterSyncBundle = {
    formatVersion: 1,
    characterId: local.characterId,
    updatedAt: [ancestor.updatedAt, local.updatedAt, remote.updatedAt].sort().pop() || new Date().toISOString(),
    character: mergedCharacter || {},
    sheet: mergedSheet,
    inventory: {
      containers: mergedContainers,
      items: mergedItems
    },
    spellbook: mergedSpellbook,
    spells: mergedSpells,
    soulReaperProgression: mergedSoulReaper,
    pdfDocuments: mergedDocs,
    pdfBookmarks: mergedBookmarks,
    portrait: mergedPortrait as any,
    tombstones: mergedTombstones
  };

  return {
    success: conflicts.length === 0,
    merged: mergedBundle,
    conflicts
  };
}

/**
 * Create a forked copy of a character bundle with a conflict-indicating name.
 * The fork preserves the local version while the original absorbs remote changes.
 * 
 * @returns A new bundle with a fresh characterId and modified name
 */
export function createConflictFork(
  localBundle: CharacterSyncBundle,
  characterName: string,
): CharacterSyncBundle {
  const newCharacterId = crypto.randomUUID();
  const fork: CharacterSyncBundle = JSON.parse(JSON.stringify(localBundle));
  
  fork.characterId = newCharacterId;
  
  if (fork.character) {
    fork.character.id = newCharacterId;
    fork.character.name = `${characterName} (Conflict — ${new Date().toISOString()})`;
  }

  const updateFk = (obj: any) => {
    if (obj && typeof obj === 'object') {
      if ('characterId' in obj) {
        obj.characterId = newCharacterId;
      }
    }
  };

  updateFk(fork.sheet);
  updateFk(fork.spellbook);
  updateFk(fork.soulReaperProgression);

  fork.inventory.containers.forEach(updateFk);
  fork.inventory.items.forEach(updateFk);
  fork.spells.forEach(updateFk);
  fork.pdfDocuments.forEach(updateFk);
  fork.pdfBookmarks.forEach(updateFk);
  if (fork.tombstones) {
    fork.tombstones.forEach(updateFk);
  }

  fork.updatedAt = new Date().toISOString();

  return fork;
}
