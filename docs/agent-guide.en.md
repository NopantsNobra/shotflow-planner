# Stillmark — External Agent Guide

Applies to `stillmark.asset-pack` ZIP container v1 and business data v1. Read `../capabilities.json` at the deployment root first: it lists supported versions, `kind` values, schema/example paths, current limits, and whether validate-only and import receipts are available. Do not infer capability from the app version alone.

## Quick start

1. Confirm scope with the user: a set of shots, a full project, or shots appended to a named project. Use only user-provided or explicitly authorised needs, dates, locations and images. Leave unknowns empty or mark them as unconfirmed.
2. Read the [archive format](asset-pack-format.en.md), the [data schema](../schemas/asset-archive-data-v1.schema.json), the [manifest schema](../schemas/asset-archive-manifest-v1.schema.json) and the examples under `../examples/`.
3. Build a ZIP containing only `manifest.json`, `data.json` and the declared `images/<sha256>.<ext>` entries. Reference images by logical keys in `data.json`; map keys to paths and SHA-256 in the manifest. Never embed Base64 images in JSON.
4. Deliver the `.stillmark.zip`. If you are allowed to operate the user's browser, choose Import, check the preview counts, and let the user confirm. Never claim that data was written unless the app confirmed it.
5. After import, copy the JSON receipt (project/shot IDs, package digest, timestamp) for later precise references.

`data.json` may carry `packId` (a stable ID you generate for this delivery) and `targetHint` (`id`/`name`/`client` of the project a `shots` pack is meant for). `targetHint` is advisory only: the app still previews and asks the user to confirm. `packId` is used to warn about repeated imports; it never bypasses user consent.

## Task prompt

Use [Generate shoot plan v3 (EN)](agent-tasks/generate-shoot-plan-v3.en.md). v1/v2 are historical. The settings page lets the user review, edit, copy and restore the default prompt locally; the app never sends it to a model and grants no access to local projects. The prompt and the data schema are versioned separately. The [blind-test procedure](agent-blind-test.en.md) describes how an independent Agent is validated.

## Package layout

```text
session.stillmark.zip
├── manifest.json
├── data.json
└── images/<sha256>.<jpg|png|webp|gif|avif>
```

`data.json` has `dataVersion: 1`, `kind` (`projects` or `shots`) and `entries`. Container version, data version and kind are independent. Image archive paths are named by the SHA-256 of the original bytes; multiple logical keys may map to one image file. A shot may reference at most three images. Only JPEG, PNG, WebP, GIF and AVIF are accepted; no SVG, scripts, remote URLs, nested archives, encrypted entries or symlinks.

## Time semantics

- `shots[].slot` is a materialised scheduling result. The engine re-derives it on first entry to a shoot day or when the user replans. Set `schedule[].timeLocked: true` for times the user explicitly fixed.
- Missing `shots[].duration` means 10 minutes; valid range is 5–1440.
- `shootDates` is the source of truth and `shootDate` equals its first element. Use IANA time-zone names in `timeZone`, not UTC offsets.
- `sceneId` must reference a scene in the package or be empty; `refIds` images must be declared in the manifest.

## Privacy and limits

Agents may use only data authorised for the current task. Do not read IndexedDB, upload user photos, deploy remotely or write to the app database. A projects pack may contain client names, locations, schedules, budgets and notes; confirm scope before generating it. Import is transactional and user-confirmed. Current ceilings (ZIP 128 MiB, single image 16 MiB, 20,000 logical image references, 10,000 ZIP entries, 16,384 px / 40 MP per image) are mirrored in `capabilities.json`; browser capacity may be lower. Encrypted/signed packages, automatic overwrite, remote URL images and full-database restore are not supported.

## Validation

Use `npm run pack:validate -- <extracted-pack-dir>` for machine-readable JSON diagnostics before delivery. The app's "Validate only" button and the production importer perform full ZIP-level checks; CLI checks complement, not replace, them. On failure keep the source package, report the error honestly, and retry through the normal import entry after fixing it.
