# Multi-file character import

## Local import

Local import is the default. A user can add any mix of PDFs and browser-supported images to one character import session. Selected files are stored temporarily in IndexedDB, along with their order, parse results, merged draft, conflicts, and selected import mode. This allows the user to leave the import page and resume later.

Each file is parsed independently with the existing PDF.js and local Tesseract.js pipeline. Complementary list and text fields are combined. Contradictory scalar values are marked as conflicts and require review instead of being silently overwritten.

Removing a parsed file immediately rebuilds the merged draft from the remaining parse results. Saving or explicitly discarding the session removes its temporary files.

## Optional Online AI import

Online AI import uses the same session, merge, conflict, and review pipeline. It is disabled unless:

- the device reports an internet connection
- `VITE_AI_OCR_ENDPOINT` is configured when the app is built

The app asks for confirmation immediately before files are sent. If the provider fails, selected files remain in IndexedDB and the user can retry or switch to Local import.

The endpoint must:

1. Accept a `POST` multipart form with one or more fields named `files`.
2. Allow requests from the static app origin with CORS.
3. Return JSON shaped like:

```json
{
  "documents": [
    {
      "fileName": "sheet-page-1.jpg",
      "rawText": "Character Name: ...",
      "confidence": 0.91,
      "pageCount": 1
    }
  ]
}
```

No real AI OCR service or API credential is bundled. A provider endpoint must be selected and configured separately. Do not put secret provider API keys directly into this client-side PWA.
