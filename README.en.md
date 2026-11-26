# Stillmark · Photography Planning Workbench

[简体中文](README.md) · [Technical overview](overview.en.md) · [Changelog](CHANGELOG.md) · [Product principles (Chinese)](PRODUCT.md) · [Development roadmap (Chinese)](docs/portable-agent-roadmap.md)

> Freeze the moment. Leave a mark.

Stillmark is an AI-friendly photography planning and shoot-day workbench for independent photographers. Start with an idea or a reference image, collaborate with the AI tools you choose to shape a shoot plan, then carry that same plan into execution. Projects and images remain local by default, while versioned file contracts let external agents prepare content for the existing import, preview and confirmation flow. Seamless integration across AI tools is a product direction; today, collaboration uses guides, files and the existing import flow.

**Minimize planning overhead, maximize confidence on set, and preserve creative freedom.** Stillmark does not require exposure settings in advance, replace aesthetic judgment, or attempt to be a RAW manager, lighting simulator, editing suite or full production management system.

- **v11.0.0** (first formal release) | Review, edit, copy and reset Agent prompts; custom prompts stay in this browser.
- Local storage, offline use and PWA installation. Project data and user-uploaded images are not automatically uploaded.
- [Build and test status](https://github.com/NopantsNobra/shotflow-planner/actions) · MIT License

## Design philosophy

**AI-friendly · Local-first · Portable by design**

- Local-first: users control projects and personal images; the core workflow requires no account, network or model service.
- Portable by design: transfer user-selected assets between devices without cloud synchronization. `main` includes strict script CSP and multi-project/arbitrary-shot ZIP export and import. Shot packages can create a project or append to an explicitly selected project; legacy JSON import remains available.
- Agent-ready: external agents can use the [operation guide](docs/agent-guide.md), [shoot-plan task prompt](docs/agent-tasks/generate-shoot-plan-v3.md), schemas and ZIP examples to prepare assets for the normal import, preview and confirmation flow. The Settings page exposes the complete prompt for review and editing; it never calls a model or reads project data automatically. See the [copyable independent test instructions](docs/agent-blind-test-prompt.md). ZIP packages pass three-engine CI and desktop browser checks; independent-agent blind testing and real mobile/PWA handoff remain post-release validation items.

The goal is low-friction planning, handoff and execution for humans and agents, not a larger management suite. See the [development roadmap](docs/portable-agent-roadmap.md).

## Quick start

**Desktop:** download [shotflow.html](shotflow.html) and open the saved file in a modern browser. No installation required.

**Mobile:** deploy [shotflow-app/](shotflow-app/) to an HTTPS static host. On iOS Safari, use Share → Add to Home Screen; on Android Chrome, use Install app or Add to Home screen. Offline access is available after the first successful online load. Service Workers and PWA installation are unavailable with direct file opening; local storage can also be restricted by the browser, so verify that saving works.

## Workflow

```text
Concept / Moodboard / References / Scenes / Checklists
                         ↓
                    Shot list (hub)
                         ↓
        Schedule → Shoot day → Done / Revisit
            ↘ Proposal / Call sheet / Field manual
```

One plan powers planning, communication and on-set execution without repetitive data entry.

| Module | Purpose |
|---|---|
| Board | Six lifecycle stages, search, progress, to-dos and archive |
| Concept & moodboard | Creative intent, text, colors, selected imagery, clipboard paste, drag-and-drop, multi-image import and tags |
| Shot list | Up to three references per shot; date, scene, duration and optional position, light and notes; rapid entry, copying, batch editing, drag or move buttons, must-shoot marks |
| Schedule | Multi-day linear scheduling, locked events, conflict indicators, preview and undo for replanning |
| Checklists | Scenes, wardrobe/props, gear and completion; no equipment inventory system |
| Budget & coordination | Costs, payment status, to-dos and communication notes |
| Shoot day | Dark fullscreen view, current item, large references, complete/skip/revisit and must-shoot reminders |
| Documents | Client proposal, standalone HTML proposal, call sheet and field manual; print or save as PDF |
| Favorites & asset packs | Reuse entries across projects; export/import with image and scene dependencies |

### Workspace presets

Casual, Portrait, Professional and Custom modes share one data model. Switching presets changes visible modules without deleting data. Casual keeps concept, moodboard, shots, checklists and shoot-day access; Portrait adds scheduling and documents; Professional shows the full workbench. Custom lets you choose visible modules while retaining the shot list.

### Scheduling and natural light

Shot order and duration determine the schedule. Routine scheduling does not silently move shots to another date; overflow stays on its original date until explicitly replanned. Cross-day replanning requires confirmation, and locked events are not automatically shifted. Sunrise, sunset and approximate golden-hour times use shoot coordinates, target date and IANA time zone; weather, terrain and obstructions are not modeled.

### Reusable materials

The moodboard contains explicitly selected images; references uploaded from the shot list do not automatically appear in a proposal. The existing favorites pack retains legacy JSON compatibility. Project and shot handoffs use standard ZIP packages with separate binary images; a shot package can be appended to an explicitly selected project. See the [asset-pack specification](docs/asset-pack-format.md) for the format and limits. Share only authorized materials and remove confidential client information.

## Data, offline use and privacy

Projects and images are stored in browser IndexedDB. Concurrent edits to different projects can be merged transactionally; conflicting changes to the same project are rejected, preserving the local draft and offering a backup. Cross-tab notifications require BroadcastChannel support. Backups are portable JSON files, not mandatory cloud sync.

- Export an individual project and import it as a new project.
- Export a full backup under Settings → Data & backups; restoration requires confirmation, validates image dependencies and writes atomically.
- Clearing site data, removing a browser or device failure can destroy local data. Back up before moving devices.
- The optional shisei pose gallery syncs via a public CDN and caches images locally with pagination. IndexedDB v4 separates gallery metadata from image payloads and evicts cold thumbnails by count, payload size and inactivity. Normal backups exclude the entire gallery; external references may need synchronization. Selected asset packs can contain cached portable references.
- Explicit feedback submission sends feedback and browser environment details through Web3Forms; project contents are not automatically included. AI is a disabled task contract only, with no live model integration.

## Development and deployment

```text
src/shell.html              Page shell
src/styles.css              Shared styles
src/js/01-data.js           Storage and constants
src/js/02-core.js           State, migration, persistence, pure functions
src/js/03-app.js            Board and favorites
src/js/03-b-project.js      Project, concept and moodboard
src/js/03-c-shots.js        Shot list
src/js/03-d-schedule.js     Schedule and planning engine
src/js/03-e-support.js      Checklists, budget, coordination
src/js/03-f-shootday.js     Shoot-day view
src/js/04-b-archive.js      ZIP archive writer and reader
src/js/04-c-transfer.js     ZIP export/import UI and staging transaction
src/js/04-output.js         Documents, backup, gallery and AI contract
src/js/05-boot.js           Startup and interaction helpers
src/js/06-settings.js       Settings and feedback
shotflow.html               Self-contained build output
shotflow-app/               Static deployment copy
tests/                      Logic, browser and performance tests
docs/                       Architecture, backlog, asset-pack spec and Agent guide
```

```bash
npm ci
npm run build
npm run sync
npm run verify:build
npm run verify:version
npm run sync:check
npm run test:logic
npm run test:perf
npm run lint
npm run format:check
npx playwright install chromium firefox webkit
npm run test:e2e
```

CI separately runs Chromium, Firefox and WebKit E2E, logic, performance, build and deployment consistency checks. Automated WebKit testing is not a substitute for real iOS Safari testing. Modify source files rather than manually maintaining generated files. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Scope and limitations

Stillmark is not a large film production scheduler, real-time collaboration service, billing system, delivery gallery or photo editor. Scheduling uses a simple linear engine, not a complex resource optimizer. Read-only sample projects can be copied into editable projects. Strict script CSP and ZIP asset migration are merged into `main`; independent external-agent testing and actual mobile offline use, updates and background recovery still need acceptance. Per-project storage keys and remaining engineering tasks are tracked in [the backlog](docs/backlog.md). Phase 09 (live AI integration) is paused.

See [CHANGELOG.md](CHANGELOG.md) for the full version history.

MIT License © 2026 Stillmark-服雲
