# Strict CSP migration

The dated phase notes below are implementation history. See “Final acceptance” at the end for the current status.

## Phase 1 (implemented)
- Remove static shell onclick/onkeydown attributes; explicit allowlist and document event delegation.
- No eval, Function constructor, string timers or dynamic handler compilation.
- Existing baseline CSP remains enabled; dynamic HTML templates still use inline attributes.

## Phase 2 (next)
- Migrate dynamic templates by domain (board/favorites, project/mood, shots, schedule, support, shoot day, output/settings).
- Use action identifiers plus escaped data attributes; validate argument types and entity IDs before existing business handlers. No arbitrary function lookup or parsing of executable expressions.
- Replace inline input/change/keydown/drop handlers and ensure event delegation survives partial rendering.
- Audit exported standalone proposal separately (its own HTML, CSS and script).

## Phase 3 (strict policy)
- Build-time SHA-256 of the exact assembled inline script (including newlines); insert hash into script-src, script-src-attr 'none', no unsafe-inline or unsafe-eval for scripts.
- Preserve file://, HTTPS/PWA, data image previews, legitimate CDN pose gallery fetch and explicit Web3Forms feedback. Constrain connect-src to necessary origins and allow local-only fallback behavior.
- Inline CSS is a separate decision: script strictness must not require weakening script policy to permit styles.
- Verify both generated copies and exported proposal. Test CSP violations (including malicious injected onerror and unknown actions), file://, three browser engines, offline PWA, all user workflows and mobile devices. Add CI gate for remaining inline handlers.
- Do not claim strict CSP enabled until the policy and functional tests pass. No changes to main's security policy until review.

## Phase 2 progress (2026-11-25)

**Completed — support domain + shared row buttons.**
- Added a declarative delegation layer in `05-boot.js`: `ACTIONS` is a frozen allowlist mapping action ids to direct function references with declared argument count/types. `data-do` (click) and `data-enter` (Enter key) carry only action ids; arguments are JSON-encoded into `data-aN` via `esc(JSON.stringify(v))`, then `JSON.parse`d and type-checked by `readActionArgs`. No eval, no Function constructor, no arbitrary name lookup, no expression parsing.
- Added shared helpers `doAttrs()` / `enterAttrs()` / `cancelBtn` in `03-b-project.js`; migrated `editBtn`, `favBtn` and `favPickerBtn` to the allowlist (these are used by every domain, so the benefit is global).
- Migrated all inline handlers in `03-e-support.js` (stuff / budget / todos / notes): 17 click actions + 5 Enter actions. That file now has zero `onclick=` / `onkeydown=`.
- Added E2E regression: zero inline handlers in `#tabBody` on the stuff tab; delegated add/toggle survive full `renderProject()` redraws; unknown `data-do` is ignored; malformed `data-a0` is rejected.

**Remaining (not done — do not claim strict CSP).**
- Dynamic templates in `03-b-project`, `03-c-shots`, `03-d-schedule`, `03-f-shootday`, `04-output`, `06-settings` still contain inline handlers (roughly 150 at this checkpoint). Complex cases include compound statements (`closeRefViewer();openShotRefEditor(...);...`) and state assignments that must first be extracted into named functions.
- Phase 3 policy, exported-proposal audit, file:// + three-engine + offline + mobile acceptance are all still pending. Main retains baseline CSP.

**Branch state:** `security/strict-csp` was synced with `main` at `b990d27` (merge of the v10.9.3 storage-recovery commits; the E2E file conflict was resolved by keeping both sides' tests). Branch is ahead of main, never merged.

## Follow-up audit — 2026-11-25

- Fixed optional empty third argument in the shared edit action (required IDs still reject empty values); added a browser regression. Performance harness now extracts the actual doAttrs helper rather than mocking it or weakening the threshold.
- Schedule and shoot-day domains migrated to explicit click/Enter and date-change allowlists. Their source templates have no remaining inline event attributes; the regression covers date/schedule controls, time lock, defer/restore and closing the field view.
- The policy is still baseline. Other dynamic domains and exported documents remain to be migrated; main is unchanged.

- Board/favorites, settings, output status/notifications and boot error UI migrated to the same declared actions; import uses specific file controls and the board search uses a scoped input listener. Remaining live template migration is concentrated in project/mood and shots. DOM event properties assigned in trusted JS (e.g. IndexedDB request callbacks) are not inline HTML attributes and do not violate strict CSP.

- Project metadata, workspace presets, project navigation and the moodboard migrated. Project field names, document types and file/input controls are explicitly scoped; date/time zone and tag operations continue through the existing business functions. Remaining: shots and final policy/audit.

- Shot-list templates migrated, including scoped drafts and filters, image uploads, drag/drop, batch checkbox changes, and explicit reference replacement action. Phase 2 markup audit and final policy still require validation.

- Performance gate caught repeated per-button JSON escaping in the 2,000-shot template (82.62 ms). Shot rows now encode their string ID once and reuse escaped JSON attributes with literal action IDs and numeric indices; the original 50 ms gate remains unchanged.

## Phase 3 candidate (2026-11-25, branch only)

- Build inserts SHA-256 hashes of the actual app script and standalone proposal cover-fit script. No unsafe-inline/unsafe-eval for scripts; inline styles retained intentionally for current layout. default-src none, narrowly scoped CDN/feedback connections, local PWA resources and data/blob images.
- Build fails on remaining quoted inline HTML event attributes. New browser tests attempt unauthorized inline code and verify legitimate delegated actions and exported proposal hash.
- PWA cache bumped only on the isolated branch. Strict policy must pass all CI and actual Safari/PWA/device testing before any main merge.

## Phase 3 acceptance hardening (2026-11-25, branch only)

- `0c90fa7`: require unique hash placeholders and valid proposal function boundaries. The source guard now checks case-insensitive quoted event attributes and unquoted event attributes in literal HTML tags. This is a conservative source check, not a complete HTML parser; browser CSP and E2E remain authoritative.
- `5e6517e`: independently recompute SHA-256 from both committed HTML artifacts in `verify:build`; reject missing or duplicate directives, unexpected script sources, event attributes permitted by policy, and unresolved hash placeholders.
- `fe71e88`: extend the proposal export E2E to reopen the downloaded HTML via file://, verify responsive cover resizing and reject injected script and event code.
- Independent remote artifact audit: both generated HTML files match the reconstruction from current source byte-for-byte. The embedded app and proposal hashes match independently recomputed SHA-256 values. No quoted or literal-tag unquoted event attributes matched the expanded source guard. No runtime code or generated artifact changes were needed for these commits.
- Pending: GitHub Actions push-run results, all three real browser engines, and actual iOS Safari / installed PWA / Android Chrome acceptance. Do not merge to main or declare full CSP acceptance until these are verified. Inline CSS remains an intentional exception and does not relax the script policy.

## Network, image and PWA acceptance coverage (2026-11-25)

- `77848d4`: two browser regression cases capture enforced `securitypolicyviolation` events from document initialization. A service-worker-blocked context intercepts the real browser's jsDelivr catalog/image requests and Web3Forms POST; no real feedback is sent. A second case uploads a valid PNG, checks the JPEG preview and export, imports the actual JSON, and verifies the independent image keys and identical stored bytes.
- `e9c7c1d` / `aad9f3a`: test-only HTTP fixture recreates the old v10-18 worker (the previous worker differs from the candidate only in the cache name), seeds existing v4 IndexedDB data and a cached HTML with baseline CSP, then exercises actual worker replacement, old-cache removal, strict-page reload, and image recovery. The legacy HTML uses current runtime JS; it does not simulate every historical client behavior.
- Resolved in `2d71fc1`: manual synchronization started from Settings is allowed while that dialog is open, without changing the automatic-sync preference. The E2E regression clicks the actual Settings control and verifies the shared progress UI; other dialogs, offline state, hidden documents and storage failures remain guarded.
- These are committed test cases, not executed browser results. CI and real-device acceptance remain required; no runtime/build artifact or main-branch changes were made.

## CI failure repair and delegated action hardening (2026-11-25)

- Baseline CI [45617358974](https://github.com/NopantsNobra/shotflow-planner/actions/runs/45617358974): 136/136 logic checks; Chromium and WebKit E2E passed; Firefox 48/49; 2,000-shot gate 26.57 ms (<50 ms); build, version, sync and lint passed. Failures were Firefox image decoding in the upgrade fixture and Prettier in the CSP verifier.
- `a6c7cb8`: independently checked PNG chunk CRCs and found the original IDAT CRC invalid (stored ef9a57bb; computed efa2a75b). Replaced four occurrences with a generated, CRC-valid 2x2 PNG; Firefox E2E then passed.
- `2d71fc1`: allow explicit manual synchronization in Settings (even with automatic synchronization paused, without changing the preference), retain offline/visibility/storage/other-dialog guards, schedule manual sync immediately, and share progress rendering between mood and Settings. E2E now clicks the actual Settings button. Updated both generated HTML artifacts, their CSP hash and SW cache v10-20-csp in one commit.
- `be19c83`: validate checklist categories and entity membership, edit targets, favorites types, project IDs, tabs and feedback types; cap serialized action arguments before parsing, require safe integer numeric arguments, reject disabled controls and ignore Enter during IME composition. Add browser regression with malformed actions and a legitimate Enter submit. Rebuild both HTML artifacts, hash and SW v10-21-csp atomically. This is targeted hardening, not proof that every action is independently authorization-scoped.
- `0b2bc2f` / `681526b`: preserve the Prettier gate, print exact diff on failure, and apply the formatter's reported diff.
- Latest complete three-engine verification is still required on the final revision, as is real-device Safari/PWA testing. No merge to main.

## Final acceptance (2026-11-26)

- The maintainer reports that the final revision passed actual Chrome, Firefox and Safari testing, with issues found during those runs corrected.
- A CRLF checkout failure was fixed by normalizing script bytes to LF before CSP hashing. Deployment injection now URL-encodes the sharecode and validates all transformed outputs before writing; the regression test verifies encoded special characters, the resulting script hash and failure without partial HTML writes.
- Local logic, build/hash, version, lint, format, performance and deployment-copy checks pass. The current agent environment could not rerun browser E2E because Playwright browser downloads returned HTTP 403 and its system Chromium launcher targets a missing binary; this is separate from the maintainer’s actual browser verification.
- Strict CSP is ready to merge into `main`. Inline styles remain `unsafe-inline` by design; the script policy remains hash-based with `script-src-attr 'none'`.
