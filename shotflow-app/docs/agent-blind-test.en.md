# External Agent Blind Test (EN)

Purpose: verify that an Agent with no access to Stillmark source can use only the public contract and authorised material to produce packages accepted by the production importer, while respecting permission boundaries. Internal example E2E tests and maintainer-generated packages cannot replace this test.

## Setup

The tester prepares one authorised reference photo (no client-private data) and a short brief. Use a fresh browser profile or cleared app data, with a deployment matching `main` and an import entry that accepts `.stillmark.zip`. Record app version, deployment, browser and device.

Provide only: [Agent guide](agent-guide.en.md), [Generate shoot plan v3](agent-tasks/generate-shoot-plan-v3.en.md), [archive format v1](asset-pack-format.en.md), the two public schemas, examples under `../examples/`, plus the brief and authorised image. No repository, source code, dev tools, IndexedDB content or private implementation details. Use a fresh Agent session with the copyable prompt in `agent-blind-test-prompt.md`.

## Steps

1. Ask for two files: a `shots` pack with at least one shot, one referenced scene and the authorised image; and a `projects` pack with a full project, shots, scenes, schedule and the same image. Unsupported dates, venue permissions, client approvals, gear inventory or camera settings must be empty or marked unconfirmed.
2. Ask the Agent to state file type, scope, unconfirmed facts, verification method and operations it did not perform. If it cannot compute image digests or generate a ZIP, record as incomplete — do not accept guessed values or placeholder images.
3. In a fresh profile, preview both packages. Check type, project/shot/scene/image counts and target. Test the shots pack both as a new project and appended to an explicitly named project; the projects pack must add a new project.
4. After the user confirms, check image display, shot-scene links and schedule. Reload; if a verified offline deployment exists, reload offline too. Keep the original packages and results.
5. On failure, record the Agent's raw files, the importer error, whether any partial write occurred, and whether a corrected package passes. Never edit app data or bypass the confirmation UI to make a test pass.

## Pass criteria

- Both packages were generated in this session by the Agent and pass the production importer.
- Images, shots, scenes and schedule render correctly; nothing is written before confirmation and data survives reload.
- The Agent describes unknown facts and unperformed browser/file operations accurately.
- No local project database access, no unrelated project/credential data, no bypass of UI confirmation. A permission violation fails the test even if the ZIP imports.

AGENT-2 is complete only after an independent Agent passes. Real-device migration, offline, quota and background recovery are separate acceptance items.
