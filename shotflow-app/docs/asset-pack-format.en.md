# Stillmark Asset Pack v1 — Container and Data Format (EN)

Status: v1 project and shot packs are implemented in `main`. CI covers Chromium, Firefox and WebKit. Independent external-Agent blind testing, real mobile hand-off and device-level capacity/background recovery remain unverified. Package-level Schema/hash checks do not replace production UI import.

## Container

A `.stillmark.zip` contains only `manifest.json`, `data.json` and the declared `images/<sha256>.<ext>` entries. A single empty `images/` directory entry is tolerated. Reject absolute paths, `..`, backslashes, NUL, duplicate/normalised paths, directory stubs, symlinks, encryption, unsupported compression methods and undeclared entries. Supported image MIME types: JPEG, PNG, WebP, GIF, AVIF.

`manifest.json` declares: `format: "stillmark.asset-pack"`, `containerVersion: 1`, `dataVersion: 1`, `kind` (`projects`|`shots`), `exportedAt`, `data: {path:"data.json", bytes, sha256}` and `images: [{key, path, bytes, sha256, mime}]`. Byte counts are exact and digests are lowercase hex SHA-256 of original bytes.

`data.json` declares `dataVersion: 1`, `kind`, `entries` (1–200 projects), and optional `packId` and `targetHint`. `packId` is a stable delivery identifier for duplicate warnings; `targetHint` is an advisory `{id,name,client}` for shot packs. Neither grants write permission.

## Business entries

`apps`, `version`, `type` and other internal fields are not part of this format. A project entry has a required `name`; other fields are optional and strongly bounded: `status` (one of the six lifecycle values), `shootDates` (ISO dates), `timeZone` (IANA name), `concept`, `tagVocab`, `shots`, `scenes`, `refs`, `mood`, `schedule`, `items`, `budget`, `notes`, `todos`. Unknown fields are rejected.

- `shots[].refIds`: at most 3 logical image keys.
- `shots[].duration`: integer 5–1440 or null; missing means 10 minutes.
- `shots[].slot`: persisted scheduling result; the app may re-derive it.
- `schedule[].timeLocked`: true preserves the user-specified time.
- `sceneId` must match a scene id in the same entry or be empty.
- Image references must resolve to manifest entries; unreferenced manifest images are rejected by the importer.

## Semantics of import

| kind | Export source | Import result |
|---|---|---|
| `projects` | multi-select projects on board | adds new projects, never overwrites existing ones |
| `shots` | independent shot multi-select in a project | creates a slim project, or appends to a user-chosen project |

On append, only the selected shots and their direct scene/image dependencies are written; target metadata, schedule, budget, notes and existing shot order are preserved. Same-name scenes are not merged. IDs and image keys are remapped. If the target disappears or the data baseline changes before commit, import is refused.

## Limits and verification

Current ceilings are generated into `capabilities.json`: ZIP 128 MiB, expanded 128 MiB, data 16 MiB, manifest 4 MiB, single image 16 MiB, 20,000 logical image refs, 10,000 unique entries, 16,384 px and 40 MP per image. Validate with `npm run pack:validate -- <extracted-dir>` and the app's validate-only button; only a successful production import and read-back counts as end-to-end verification.
