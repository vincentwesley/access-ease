# AccessEase spec (v1)

**Value prop:** One side panel. Make any web page easier to read: bigger text, high contrast, a dyslexia-friendly font and calmer motion. With no account, no backend and no tracking.

**Target users:** People with dyslexia, low vision or motion sensitivity; older adults; students; anyone who wants to read comfortably. Includes keyboard and screen-reader users, so the panel itself must be fully accessible.

**Core flow:** Click toolbar icon (side panel opens) -> toggle or slide a setting -> page changes instantly on the active tab -> settings saved. Optional: "Apply on all sites" grants host access once and persists settings.

## In scope
- Text size: slider 100-200% (step 10).
- High contrast: off / black-on-white / white-on-black (CSS override, photos and videos untouched).
- Dyslexia font toggle (OpenDyslexic) with a modest line-spacing bump.
- Reduce animations toggle (zero animation/transition, no smooth scroll).
- Reset my settings. Panel follows system dark/light, full keyboard and ARIA support.

## Out of scope
Accounts, sync, per-site profiles, reading ruler, colour-blind filters, translation, PDF reading, Firefox/Safari, analytics, custom fonts, custom keyboard shortcuts (later).

Read aloud / text-to-speech: cut by user decision.

## Permissions
| Permission | Why |
|---|---|
| `storage` | Save settings locally (`chrome.storage.local`). |
| `activeTab` | Temporary access to the current tab on user click, no install warning. |
| `scripting` | Inject/remove CSS on that tab. |
| `sidePanel` | Host the UI. |
| optional host `<all_urls>` | Only if the user enables "Apply on all sites"; enables a registered content script so settings auto-apply. |

No `tabs`, `history`, `webRequest` or static host permissions.

## UI outline
Header (name, Reset) / Text size slider with live % / Contrast segmented control / Dyslexia font switch / Reduce motion switch / "Apply on all sites" switch with one-line explanation / footer: "Nothing leaves your device."

## Storage schema (`chrome.storage.local`, key `settings`)
```json
{ "v": 1, "textScale": 100, "contrast": "off|dark|light", "dyslexiaFont": false,
  "reduceMotion": false, "allSites": false }
```
Migrations keyed on `v`.

## Testing
- Unit tests (Node built-in runner) for pure modules: settings defaults/migration, CSS generation.
- Manual checklist on 5 varied sites (news, docs, SPA, form, iframe-heavy), plus chrome:// and Web Store pages (must fail gracefully).
- Accessibility: keyboard-only pass, screen-reader pass (NVDA), axe scan of the panel, contrast check of the panel itself.
- Verify install shows no host-access warning; verify the all-sites opt-in permission flow.
