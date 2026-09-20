# Privacy Policy

**AccessEase collects no data and makes no network requests.**

## What is stored
Your settings (text size, contrast mode, dyslexia font, reduce motion, "apply on all sites", and the hostnames of sites you paused AccessEase on) are stored locally in your browser via `chrome.storage.local`. They never leave your device and are removed when you uninstall the extension.

## What is not done
- No accounts, analytics, telemetry, advertising or tracking.
- No remote code or remote fonts. The OpenDyslexic font is bundled.
- The extension's own pages run under a strict Content Security Policy that forbids network connections (`connect-src 'none'`).
- AccessEase is not undetectable by the sites you use it on: a page that is being styled can still see the per-session dynamic font URL in its computed styles and the `#accessease-style` element (when the `<style>` fallback is used), so a site that looks for them can tell AccessEase is active on that page. Nothing is sent to anyone; this only concerns what the page itself can observe.
- Page content is never collected or transmitted. AccessEase only changes how a page looks, on your device.

## Permissions
| Permission | Purpose |
|---|---|
| `storage` | Save your settings locally. |
| `activeTab` | Temporary access to the current tab after you click the toolbar icon. |
| `scripting` | Inject or remove styles on that tab. |
| `sidePanel` | Show the extension's interface. |
| optional host access (`<all_urls>`) | Requested only if you enable "Apply on all sites", so settings apply automatically. You can turn it off at any time. |

## Contact
Questions: open an issue in this repository.
