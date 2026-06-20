# Architecture

## Product boundaries

D&D Character Vault is a local-only PWA. It has no server, account system, login, analytics, or remote database. All structured data is stored in the browser using IndexedDB.

The app can be installed and run offline after its files are loaded once from a secure origin or localhost. The included GitHub Pages workflow is an optional static HTTPS installer/update source. It deploys only application files and has no access to IndexedDB vault data.

## Application modules

```text
src/
├── app/          Application composition and navigation
├── components/   Shared interface components
├── domain/       Zod schemas and domain types
├── features/     Page-level product features
├── storage/      IndexedDB and browser storage diagnostics
└── styles/       Global responsive styles
```

Features depend on domain and storage modules. Storage modules do not depend on React, keeping later import, export, and migration work independent from the interface.

## Storage

Dexie manages the `dnd-character-vault` IndexedDB database.

Version 1 introduced:

- `characters`: initial placeholder character records
- `settings`: application preferences

Version 2 expands character identity and campaign metadata and adds archive indexing. Existing records are migrated with safe defaults.

Version 3 adds:

- `characterSheets`: per-character play data, proficiencies, HP, and notes
- `pdfDocuments`: PDF metadata, page memory, systems, and character associations
- `pdfFiles`: original local PDF blobs, separated from metadata
- `pdfBookmarks`: user-defined document bookmarks

Version 4 adds:

- `inventoryContainers`: per-character default and custom inventory locations
- `inventoryItems`: per-character equipment, notes, rules, and freeform effects

Version 5 cleans up duplicate default containers that could be created by concurrent initialization in development. Container initialization is transactional.

Version 6 adds:

- `soulReaperProgressions`: optional per-character Soul Reaper level, path, soul tracker, notes, and source-PDF link

Versions 7 and 8 perform the requested one-time, character-ID-scoped import of Akiva's photographed inventory and editable body-enhancement notes. The import checks both Akiva's ID and name, and skips itself when the augmentation already exists.

Version 9 corrects the earlier local Soul Reaper ownership mismatch by moving the progression and its source-PDF association from Cloud to Akiva after validating both character IDs and names.

Version 10 adds:

- `spellbooks`: one per-character ordered pinned-spell list
- `spells`: full editable per-character spell metadata and rules text

Version 11 adds:

- `importSessions`: resumable local multi-file import state, selected mode, per-file parse results, merged draft, and conflicts
- `importSessionFiles`: temporary source-file blobs and ordering metadata

Version 12 adds:

- expanded character profile fields for concept, background/origin, backstory, goals, relationships, and roleplay notes
- expanded `characterSheets` fields for proficiency bonus, hit dice, death saves, attacks, proficiencies, languages, spellcasting, spell slots, and features
- `characterCreationDrafts`: one local in-progress guided creation draft

Character lifecycle operations live in `src/storage/characters.ts`, keeping IndexedDB details outside the interface. All persisted record shapes are validated with Zod at external boundaries. New schema changes must use a new Dexie database version and migration.

Character-owned records always carry a required `characterId`. Inventory writes validate both item and container ownership, spellbook writes validate spell ownership before pinning, and queries use character-scoped indexes. PDF associations are explicit character IDs; associating a PDF with one character does not associate it with any other character.

Browser storage remains limited by device capacity and browser policy. The diagnostics page shows quota estimates and lets the user request persistent storage when supported. Large PDFs are stored directly as blobs rather than encoded into structured records or application caches.

PDF.js renders uploaded files entirely inside the app. The original file remains local, and the PDF.js worker is part of the offline application shell.

## Offline import and backups

The Character Sheet Import Wizard extracts embedded PDF text with PDF.js. Images and scanned PDFs use locally bundled Tesseract.js worker, core, and English language assets. Multiple mixed source files are parsed independently and merged into one review draft. Contradictory scalar values become explicit conflicts, while complementary inventory, feature, spell, and note text is combined.

Import sessions and original source blobs are stored temporarily in IndexedDB so the user can resume later. The optional Online AI provider abstraction is disabled unless an endpoint is configured and the device is online. It requires explicit confirmation before sending files; local import remains the default.

Manual backups are versioned, checksummed JSON files. Lightweight backups omit PDF blobs; full backups encode PDF blobs into the user-controlled file. Restore validates schemas, checksum, character ownership, inventory containers, PDF associations, bookmarks, and custom class ownership before opening a write transaction.

## PWA behavior

`public/manifest.webmanifest` provides install metadata. Production builds generate `dist/sw.js` from the exact output file list and content hash. The service worker precaches the complete app shell, PDF viewer, and offline OCR assets, and uses a cache-first strategy for static files and app navigation. The service worker is registered only in production builds.

All install paths are relative, allowing the same build to work at an HTTPS domain root or a GitHub Pages project path. Static hosting is used only to deliver and update app files; character data and uploaded files never leave the device.

The manifest includes SVG, 192px PNG, and 512px PNG icons plus iOS standalone metadata. Physical-device testing remains necessary because iOS storage quotas and Add to Home Screen behavior vary by iOS release and device capacity.

The responsive layout switches from the desktop sidebar to a five-item bottom navigation below 680px, preserves safe-area padding, and keeps primary play and import controls at touch-friendly sizes.

## Deferred work

- Journal entries
D&D rules automation and remote accounts remain outside the architecture.
