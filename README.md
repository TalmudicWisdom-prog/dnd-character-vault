# D&D Character Vault

An offline-first, local-only Progressive Web App foundation for keeping D&D characters on iPad and desktop.

Implemented foundations, character management, and play tools include:

- Responsive app shell for tablet and desktop
- Guided 10-step character creation with locally saved draft progress
- Character editing with overview, roleplay, abilities, skills, combat, proficiencies, spells, features, notes, archive, duplicate, restore, and delete
- Ability scores, saving throws, skill proficiencies, combat stats, and character notes
- Touch-sized HP damage and healing controls
- Character-scoped inventory, equipment, custom containers, and freeform item effects
- Character-scoped editable spellbooks with complete spell metadata, filters, and ordered pinned shortcuts
- Editable character-scoped body enhancements and abilities stored alongside inventory
- Character-scoped Soul Reaper progression with independent levels, path features, soul tracking, and a linked local source PDF
- Offline PDF library with local uploads, PDF.js rendering, page memory, bookmarks, and character associations
- Resumable multi-file character import from mixed PDFs, scans, photos, and screenshots
- Private local OCR by default, with a consent-gated optional Online AI provider interface
- Manual checksummed lightweight and full vault backups with validated restore modes
- IndexedDB setup with Dexie
- Zod schemas for stored data
- Storage diagnostics and persistent-storage request
- Basic settings stored locally
- Basic offline app shell and install manifest

It intentionally does not include D&D rules automation, accounts, a backend, or cloud-dependent file storage. Optional static HTTPS deployment serves only the installable app files; vault data remains local.

## Run locally

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev
```

Open the local address printed in the terminal, usually `http://localhost:5173`.

To test the production build and service worker:

```bash
npm run build
npm run preview
```

The service worker is registered only in production builds, avoiding stale files during development.

### Cloud-synced folders

This project folder currently resolves into Dropbox. Some macOS Node installations can reject Rollup's native build helper when it is loaded directly from a cloud-synced folder. If `npm run build` reports a native-module code-signing error, move or clone the project into a normal local folder, run `npm install`, and build there. This does not affect the app or its local-data design.

## Available commands

- `npm run dev`: start the development app
- `npm run typecheck`: check TypeScript
- `npm run build`: type-check and build the production app
- `npm run preview`: serve the production build locally
- `npm test`: run import, ownership, and backup/restore tests
- `npm run verify:pwa`: build and verify the manifest and complete offline cache

## Local data

The app uses the browser's IndexedDB database named `dnd-character-vault`. Settings, character sheets, inventories, and PDFs stay on the current device and browser profile. Clearing site data or deleting an installed PWA may remove the vault.

See [docs/architecture.md](docs/architecture.md) for technical boundaries and future-phase guidance.

See [docs/import-sessions.md](docs/import-sessions.md) for multi-file import behavior and the optional Online AI provider contract.

## iPad and iPhone

The recommended installer is the included GitHub Pages static HTTPS deployment. A local HTTP network address can open in Safari, but iOS will not reliably install its service worker for offline Home Screen use.

See [Install on iPad or iPhone](docs/install-on-ios.md) for the exact publish, installation, offline verification, and update steps.

Character data remains in that device/browser's local storage. Use **Vault Tools > Backup & Restore** to move a user-controlled backup through Files, iCloud Drive, Dropbox, Google Drive, local storage, or an external drive. No cloud service is contacted directly by the app.

On iPhone or iPad, Safari may remove site data under storage pressure. Add the app to the Home Screen, request storage protection on the Storage page, and keep a recent manual backup. The app cannot guarantee iOS storage retention.
