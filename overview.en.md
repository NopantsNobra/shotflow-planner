# Stillmark: Product and Technical Overview

[简体中文](overview.md) · [README](README.en.md)

Current: v10.9.1. A local-first photography planning and field-execution workbench for independent photographers and small teams. The shot list is the central data model: existing materials generate schedules, client documents and shoot-day reminders without making creative decisions for the photographer. Self-contained HTML, zero runtime dependencies, static hosting and PWA support.

## Product flow

Concept, moodboard, references, scenes and checklists → shot list → linear schedule, shoot-day view and client documents. Casual, Portrait, Professional and Custom presets control visibility only. Image references share stored data; portable favorites packs enable cross-device reuse.

## Data model

Projects hold identity, metadata, workspaceMode/workspaceCustom, timeZone, concept, mood, refs, tagVocab, scenes, shootDates/dayInit, shots, schedule, items, budget, notes and todos. Shots contain name, date, derived slot, duration, sceneId, up to three refIds, optional position/light/note, order, completion, mustShoot, skipped, deferred and favorite flags. Schedule entries have start/end, date, completion, timeLocked and optional call/wrap markers. Imported assetPack groups stay in favorites. View state is session-only.

## Core implementation

| Layer | Implementation |
|---|---|
| Storage | IndexedDB v3, projects/all collection and images store; in-memory cache, 200 ms debounce, serial write chain, retry, visibility/pagehide flush |
| Concurrency | mergeProjectChanges compares project IDs in a readwrite transaction. Disjoint edits merge; same-project conflicts are rejected. BroadcastChannel notifications; full restore/clear retain strict baseline checks |
| Migration | sanitizeProject whitelists fields and limits types/lengths, remaps entity IDs; migrate handles old structures. Backup image keys are remapped; project/image writes are atomic |
| Scheduling | planDay derives slots; applyDay defaults to the original day. Explicit cross-day replanning requires confirmation and offers undo. Locked events retain their times |
| Daylight | NOAA approximation using target date and IANA time zone; shoot-day current time uses the project zone |
| Gallery | Shared index/statistics cache, invalidated on writes and expiring after 30 seconds; 48 images per category page with batched reads. Initial scan still reads image records |
| Assets | buildAssetProjects and copyAssetDependencies preserve scene/image dependencies; imported assetPack groups stay out of the board |
| Interaction | Pointer Events reorder the full project relative to the actual target; move buttons provide keyboard alternatives, dialog focus handling, baseline CSP and escaped input |
| AI | createAiService, ten task contracts, minimal context, capability/schema/reference validation and stale candidate protection. Production service disabled; phase 09 paused |

## Source and verification

JavaScript is assembled in filename order: 01-data, 02-core, 03-app (board/favorites), 03-b-project, 03-c-shots, 03-d-schedule, 03-e-support, 03-f-shootday, 04-output, 05-boot and 06-settings. The shell and shared CSS produce shotflow.html, synchronized to shotflow-app/.

verify:build checks byte-for-byte output; verify:version checks metadata; sync:check verifies deployment copies; test:logic exercises pure functions; test:perf gates 2,000-shot templates; test:e2e runs the browser matrix. Lint checks the assembled script scope. See [Actions](https://github.com/NopantsNobra/shotflow-planner/actions) for actual results.

## Deployment and limitations

Static HTTPS hosting, no backend; direct file use is subject to browser storage restrictions. The database still uses a collection key, not real-time collaborative storage. Baseline CSP does not yet restrict inline scripts. Real mobile device testing and remaining work: [backlog](docs/backlog.md). Disabled AI contract: [ai-contract](docs/ai-contract.md). Historical details: [CHANGELOG](CHANGELOG.md) and [system design (Chinese)](docs/system_design.md).
