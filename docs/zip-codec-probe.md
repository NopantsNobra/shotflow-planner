# ZIP codec compatibility probe

Status: candidate evaluation, not runtime ZIP support.

Candidate: zip.js v2.25.0, native standalone UMD bundle, 173,743 bytes.
- Upstream release: https://github.com/gildas-lormeau/zip.js/releases/tag/v2.25.0
- Exact source: https://github.com/gildas-lormeau/zip.js/blob/v2.25.0/dist/zip-native.min.js
- Git blob: ebe0bb5989614734dedf104b0fa1e4cb26d4bf06
- License: BSD-3-Clause; original license retained in src/vendor/zip-native-2.25.0.LICENSE.txt.
- Native bundle has no WebAssembly and no closing script tag. The test config explicitly disables Web Workers and native compression streams to exercise the pure-JS fallback. No external worker or CDN resources are used in the probe.

Tests in tests/e2e/zip-probe.spec.js generate an isolated, self-contained HTML page whose only inline script is hash-authorized by strict CSP. Chromium, Firefox and WebKit execute it both from file:// and localhost. The probe checks a synthetic small ZIP64 archive, STORE and DEFLATE entries, streaming sink output, CRC-checked reads, exact binary bytes, a standard ZIP fixture independently produced by Python zipfile, SHA-256 using WebCrypto and no CSP violations/network requests.

The probe deliberately does not change the production application or enable ZIP imports. Passing it does not prove true 4-GiB capacity, large-pack memory behavior, malicious-archive rejection, file-handle support, PWA offline behavior, or real iOS compatibility. The next stage must implement the archive envelope and bounded archive reader, then test before connecting the normal import transaction.
