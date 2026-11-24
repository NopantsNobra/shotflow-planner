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
