# Security Policy

## Supported versions
Only the latest release receives fixes.

## Reporting a vulnerability
Please do not open a public issue. Use GitHub's private vulnerability reporting (Security tab, "Report a vulnerability") for this repository. Include steps to reproduce and the affected version. You can expect an initial response within a few days.

AccessEase makes no network requests and collects no data, which keeps its attack surface small. Extension pages run under a strict CSP (no inline script, no connections; the panel embeds no frames), and web-accessible resources use dynamic URLs. What is verified (Chromium e2e): a web page cannot fetch the extension's files by the fixed extension id (`chrome-extension://<id>/...` is blocked). It is NOT invisible: a page that is being styled can still see the per-session dynamic font URL in its computed styles and the `#accessease-style` element (when the `<style>` fallback is used), so a site that looks for them can tell AccessEase is active on that page. Reports about this are welcome but it is a known limitation, not a vulnerability. Reports about permission scope, content-script isolation or script injection are especially welcome.
