# Data Model

## Character

The character record stores identity and organization details without implementing game rules:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID string | Stable local identifier |
| `name` | string | 1-100 characters |
| `summary` | string | Long-form summary or backstory, up to 20,000 characters |
| `playerName` | string | Optional player name |
| `campaign` | string | Optional campaign name |
| `ancestry` | string | Optional ancestry label |
| `characterClass` | string | Optional class label |
| `background` | string | Background or origin label |
| `concept` | string | Short character concept |
| `personalityNotes` | string | Roleplay personality details |
| `backstory` | string | Long-form backstory |
| `goals` | string | Character goals |
| `importantRelationships` | string | Allies, rivals, family, patrons, and other bonds |
| `roleplayNotes` | string | Voice, mannerisms, reminders, and table notes |
| `level` | integer | Manually entered level from 1-20 |
| `archivedAt` | ISO timestamp or `null` | Archive state |
| `createdAt` | ISO timestamp | Record creation time |
| `updatedAt` | ISO timestamp | Last modification time |

Related sheet and inventory tables keep character-owned data independent rather than turning this record into one large document.

## Spellbook

Each character owns one `spellbooks` record and any number of `spells` records.

- `spellbooks` stores the required `characterId` and the manually ordered `pinnedSpellIds` quick-access list.
- `spells` stores the required `characterId`, complete editable spell metadata, rule text, source notes, source label, and standard/homebrew flag.
- A pinned ID is valid only when its spell belongs to the same character.

Deleting a character removes only that character's spellbook and spells. Duplicating a character creates new spell IDs and preserves the pinned order in the copy.

## App settings

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `"app"` | Single settings record |
| `theme` | `system`, `light`, or `dark` | Local appearance preference |
| `backupReminders` | boolean | Preference for future backup reminders |
| `updatedAt` | ISO timestamp | Last modification time |

Stored settings are validated with Zod. Invalid or missing settings are replaced with defaults.

## Character creation draft

The character creator stores one local `characterCreationDrafts` record with:

- current wizard step
- creation mode, either Guided or Manual
- editable character profile draft
- unsaved sheet draft
- starting equipment draft

Drafts may be incomplete. Final creation requires name, class, ancestry/species, and level. Creating the character writes the character record, character sheet, starting inventory, and starter spell entries, then removes the draft.

## Character sheet

Each character has one independently stored sheet record containing:

- Six ability scores
- Proficiency bonus
- Current, maximum, and temporary HP
- Armor Class, initiative, speed, hit dice, death saves, attacks, weapons, and damage notes
- Saving throw and skill proficiency flags
- Armor, weapon, tool, and language proficiencies
- Spellcasting ability, spell save DC, spell attack bonus, cantrips, prepared spells, spell slots, and spell notes
- Used spell slots are tracked separately from maximum slots for manual +/- controls and Long Rest reset
- Class features, species traits, background feature, feats, and special abilities
- Long-form character notes

The record autosaves locally and can evolve independently from character identity.

## Inventory

Every inventory container and item has a required `characterId`. Storage operations validate that an item's selected container belongs to the same character before saving or moving it.

- `inventoryContainers` stores the character owner, container name, and display order.
- `inventoryItems` stores the character owner, container, name, quantity, category, source label, equipped/favorite flags, description, custom rules, and freeform effects/stat notes.

Body enhancements and custom abilities use the same editable inventory-item model and can live in a dedicated character-owned container. They remain freeform, do not automate rules math, and never affect another character.
- Main Inventory, Bag of Holding, and Void Bag are initialized independently for each character.
- Custom abilities and stat modifications granted by an item remain descriptive text; no rules math is automated.

Deleting a character deletes only that character's sheet, containers, and items. Duplicating a character creates new container and item IDs owned by the copy.

## Rules sources

Rules-like records can carry one of four source labels:

- `SRD`: bundled SRD 5.2.1 helper data
- `Manual`: typed or edited by the user
- `Imported PDF`: extracted from a user-selected local file and requiring review
- `Homebrew`: custom or table-specific content

Source labels are informational. They do not automate or apply rules by themselves.

## Soul Reaper progression

Soul Reaper progression is an optional, character-scoped class track based on the user-provided 18-page Soul Reaper guide. It is stored separately from the character's normal level so multiclass and DM-granted progression can advance independently.

- `characterId`: required owner and primary key
- `level`: independent Soul Reaper level from 1-20
- `path`: Grave Warden, Soul Binder, Dread Reaper, Pale Rider, Plague Reaper, or unselected
- `currentSouls`: live soul-resource tracker
- `sourcePdfId`: optional direct link to the locally stored guide
- `notes`: character-specific Soul Reaper rulings and decisions

The interface derives proficiency, Soul Dice, soul capacity, undead capacity, spell slots, current features, and next-level features from the guide's progression table. It does not automatically modify the base character sheet.

## PDF library

PDF metadata and file data are stored separately:

- `pdfDocuments` stores title, file name, size, game system or collection, explicit associated character IDs, and last page.
- `pdfFiles` stores the original PDF blob keyed by document ID.
- `pdfBookmarks` stores named page bookmarks.

This separation keeps large PDF blobs out of metadata queries and future structured JSON exports.

## Manual backup file

Backups contain a format version, app version, creation timestamp, PDF inclusion flag, SHA-256 payload checksum, and arrays for every current IndexedDB table, including spellbooks, spells, and the saved character-creation draft. Full backups additionally include PDF blobs encoded as base64. Backup files are never stored or transmitted automatically. Older version 1 and version 2 backups remain restorable and are upgraded with empty newer collections.
