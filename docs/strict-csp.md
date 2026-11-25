# Strict CSP migration — isolated branch

Branch: security/strict-csp. Do not merge until all acceptance checks pass. Main retains baseline CSP.

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
