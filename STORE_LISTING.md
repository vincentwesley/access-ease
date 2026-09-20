# Chrome Web Store listing: AccessEase

Everything below is ready to paste into the Chrome Web Store developer dashboard.

## Account and fee

Publishing needs a Chrome Web Store developer account (one-time US$5 registration fee). The account owner does this and submits the listing; it is not automated. Upload the zip built by `npm run build` (`dist/access-ease-v1.0.0.zip`).

## Store listing tab

**Name**
AccessEase

**Summary (max 132 characters)**
Make any web page easier to read: bigger text, high contrast, a dyslexia-friendly font and calmer motion.

**Category**
Accessibility

**Language**
English

**Detailed description**

```
AccessEase makes web pages easier to read. Open the side panel, adjust a few settings, and the page changes straight away.

What you can change
- Text size: 100% to 200%, in 10% steps.
- Pause AccessEase on any single site and resume it later.
- High contrast: black on white or white on black. Photos and videos are left as they are.
- Dyslexia-friendly font: the OpenDyslexic typeface, bundled with the extension, plus slightly more spacing between words and lines.
- Reduce animations: stops animations, transitions and smooth scrolling.
- Reset my settings: one button puts the page back to normal.

How it works
Click the AccessEase icon to open the side panel. Your changes apply to the tab you are on. If you want your settings on every site, turn on "Apply on all sites" and approve Chrome's permission prompt. That step is optional; without it, AccessEase asks for no access to your sites when you install.

Made for reading comfort
The panel works with the keyboard and screen readers, and follows your system light or dark theme.

Privacy
No account, no server, no analytics, no tracking. Your settings are saved on your device only and nothing is sent anywhere. The extension does not read or collect page content; it only changes how a page looks. The source code is open (MIT license).

Good to know
- It cannot change Chrome's own pages (chrome://) or the Chrome Web Store.
- Without "Apply on all sites", changes cover the tab where you opened the panel and last until you navigate away.
- Some sites with unusual styling may not respond perfectly.
- Research on dyslexia-oriented fonts is mixed. The font is offered as an option some people find comfortable; AccessEase makes no medical claims.

The OpenDyslexic font is used under the SIL Open Font License 1.1.
```

**Single purpose statement**
```
AccessEase has one purpose: to make web pages easier to read by letting the user change text size, contrast, font and animation on the pages they view.
```

**Homepage / support URL**
https://github.com/vincentwesley/access-ease

**Privacy policy URL**
https://github.com/vincentwesley/access-ease/blob/main/PRIVACY.md

## Privacy practices tab

### Permission justifications (write for the reviewer)

**storage**
```
Saves the user's settings (text size, contrast mode, dyslexia font, reduce motion, apply-on-all-sites, and the hostnames of sites the user paused) in chrome.storage.local so they persist between sessions. Nothing is synced or sent off the device.
```

**activeTab**
```
When the user clicks the toolbar icon, this gives temporary access to the current tab so the extension can apply the reading settings there. It avoids requesting broad host access at install time.
```

**scripting**
```
Used with chrome.scripting.executeScript to add or remove one style sheet on the active tab (larger text, contrast, font, reduced motion). It is also used to register the optional all-sites content script. No page content is read or transmitted.
```

**sidePanel**
```
Hosts the extension's entire user interface (the settings controls) in Chrome's side panel, which stays open while the user browses.
```

**Optional host permission (<all_urls>)**
```
Not granted at install. It is requested at runtime, only when the user turns on "Apply on all sites", via chrome.permissions.request. It lets a registered content script apply the user's saved style settings automatically at page load on every site. The script only adds a style sheet; it does not read, collect or transmit page content. The user can turn the setting off at any time, which unregisters the script and removes the permission.
```

**Web-accessible resources (if asked; not a dashboard field)**
The manifest exposes two font files and three extension modules (lib/settings.js, lib/css.js, lib/inject.js) to web pages, with use_dynamic_url set to true. The page needs the fonts to render the dyslexia font, and the all-sites content script loads the modules by dynamic import. Dynamic URLs stop a site from fetching the extension's files by a fixed extension id. A page that is being styled can still see the per-session font URL and the style element, so a site that looks can tell AccessEase is active.

**Remote code**
```
No. The extension does not load or execute remote code. All scripts and fonts are bundled in the package, and the extension pages' Content Security Policy sets connect-src 'none'.
```

### Data usage

- Does the extension collect or use any of the listed user data types (personally identifiable information, health information, financial and payment information, authentication information, personal communications, location, web history, user activity, website content)? **None. Leave every box unchecked.**
- Certifications (tick all three):
  - I do not sell or transfer user data to third parties, outside of the approved use cases.
  - I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
  - I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Graphic assets

| Asset | Size | Required | Status |
|---|---|---|---|
| Store icon | 128x128 | Yes | Ready: `extension/icons/icon128.png` |
| Screenshots | 1280x800 (or 640x400), 1 to 5 | At least 1 | Ready, see below |
| Small promo tile | 440x280 | Yes | Ready: `docs/store/promo-tile-440x280.png` |
| Marquee promo tile | 1400x560 | No | Optional |

### Screenshots (1280x800)

Upload in this order, from `docs/screenshots/`:

1. `1-text-size-and-dyslexia-font.png`: "Larger text and the dyslexia-friendly font, applied instantly from the side panel."
2. `2-high-contrast-dark.png`: "High contrast, white on black."
3. `3-high-contrast-light.png`: "High contrast, black on white."
4. `4-panel-dark-mode.png`: "The side panel follows your system dark or light theme."

### Promo tile notes

The 440x280 small promo tile is ready at `docs/store/promo-tile-440x280.png`. It shows the "Aa" mark, the name "AccessEase", the line "Make any web page easier to read." and four feature chips, in high contrast, with no screenshots or claims. Regenerate it with `node scripts/make-promo-tile.mjs` (uses Playwright and the bundled OpenDyslexic font).

## Submission checklist

- [ ] Developer account registered and US$5 fee paid.
- [ ] `npm ci`, `npm test`, `npm run lint` pass; `npm run build` produces `dist/access-ease-v1.0.0.zip`.
- [ ] Manifest version in the zip matches the intended release.
- [ ] Zip contains only the extension files (manifest.json at the root).
- [ ] Name, summary, description, category and language pasted from this file.
- [ ] Store icon and 1 to 5 screenshots at 1280x800 uploaded.
- [ ] 440x280 small promo tile (`docs/store/promo-tile-440x280.png`) uploaded.
- [ ] Single purpose statement and every permission justification pasted, including the optional host permission.
- [ ] Remote code answered "No"; no data types ticked; three certifications ticked.
- [ ] Support URL and privacy policy URL set, and the privacy policy link opens (repository is public and PRIVACY.md is on the main branch).
- [ ] Distribution set (public or unlisted) and regions chosen.
- [ ] Submit for review; expect a longer review because of the optional all-sites host permission.
- [ ] After approval, update the "Coming soon" line in README.md with the listing link.
