# AccessEase end-to-end report

Run: 2026-09-20T13:14:48.277Z | Playwright chromium-1243 | headed | win32

**47/47 checks passed.**

| # | Result | Check |
|---|---|---|
| 1 | PASS | extension loads and service worker starts |
| 2 | PASS | manifest: no host access at install; only storage, activeTab, scripting, sidePanel |
| 3 | PASS | chrome://extensions shows no manifest warnings or runtime errors for AccessEase |
| 4 | PASS | panel renders headings, controls and footer, with no console errors |
| 5 | PASS | first run, page not yet allowed: status line says not active, offers all-sites, and the NO_ACCESS copy (not the "protected" copy) is shown; page untouched |
| 6 | PASS | protected page (chrome://extensions, url hidden): PROTECTED copy via the browser error, no all-sites button, never shown as live |
| 7 | PASS | manifest CSP is set; the panel violates none, and inline script is really blocked |
| 8 | PASS | web_accessible_resources use dynamic URLs: a page cannot fetch a resource by the fixed extension id |
| 9 | PASS | panel: settings persist across a panel reload (and land in chrome.storage.local) |
| 10 | PASS | panel headings: one h1, then an h2 for each card |
| 11 | PASS | panel keyboard: tab order is logical; Space on switches, arrows on radios and slider work |
| 12 | PASS | switches are named by their title only, described by their hint |
| 13 | PASS | -/+ stay enabled and keep focus at the limits, announcing "Already at the ..." |
| 14 | PASS | panel does not overflow horizontally at 260px; contrast segments stack in one column |
| 15 | PASS | axe-core scan of the panel (light mode): zero violations |
| 16 | PASS | axe-core scan of the panel (dark mode): zero violations |
| 17 | PASS | contrast segments (light): focus ring, selected fill and divider are all >= 3:1 |
| 18 | PASS | contrast segments (dark): focus ring, selected fill and divider are all >= 3:1 |
| 19 | PASS | a failed save shows a sticky notice that later applies do not wipe; a good save clears it |
| 20 | PASS | a settings load failure falls back to defaults with a notice; the panel still works |
| 21 | PASS | text size: 150% scales root and body text, and Reset restores px sizes |
| 22 | PASS | high contrast dark: light-on-dark, contrast >= 7:1 on text and links, photo untouched |
| 23 | PASS | high contrast light: dark-on-light, contrast >= 7:1, and Off removes it |
| 24 | PASS | dyslexia font: computed font-family AND the font face actually loads |
| 25 | PASS | reduce motion: animation/transition/smooth-scroll zeroed, removable, transition still completes |
| 26 | PASS | all settings combined, then Reset my settings leaves the page as originally styled |
| 27 | PASS | all-sites: switch registers the content script; a fresh page load is styled with the panel closed |
| 28 | PASS | no console errors from the extension in the granted browser |
| 29 | PASS | text size on a html{font-size:62.5%} site: 150% is ~1.5x for root, body, h1 and small print (not 2.4x), nothing clipped |
| 30 | PASS | text size on a px-sized site: the floor never shrinks the px-sized h1 |
| 31 | PASS | contrast dark: button-like link gets a 2px border, ::before icon takes the text colour, badge stays readable, genuine italics restyled |
| 32 | PASS | contrast light: button-like link gets a 2px border, ::before icon takes the text colour, badge stays readable, genuine italics restyled |
| 33 | PASS | Reset my settings resets text, contrast, font and motion, keeps all-sites, announces it and shows a visible confirmation |
| 34 | PASS | an old settings object that still has a tts key loads fine and the key is dropped on the next save |
| 35 | PASS | protected page with a visible url (.pdf, host access granted): PROTECTED copy, status not active, no all-sites button |
| 36 | PASS | px-sized site at 200%: headings never end up smaller than body text; inputs do not clip |
| 37 | PASS | C2: a change made in another window's panel shows up here without a reload |
| 38 | PASS | C1: turning all-sites off clears other tabs and the active tab, and tells the truth when Chrome keeps the permission |
| 39 | PASS | C3: turning all-sites on styles tabs that are already open, right away |
| 40 | PASS | C9: a page served with a strict CSP (default-src 'self') is still styled by the all-sites content script |
| 41 | PASS | U1: forced-colors: switch state, selected segment, status dot and focus ring stay visible, and the selected segment has a check mark |
| 42 | PASS | U8: Reset my settings shows a visible confirmation in #notice that clears itself |
| 43 | PASS | no extension console errors during the behaviour-fix checks |
| 44 | PASS | screenshot 1: panel + page before/after text size and dyslexia font |
| 45 | PASS | screenshot 2: high contrast, white on black |
| 46 | PASS | screenshot 3: high contrast, black on white |
| 47 | PASS | screenshot 4: the panel in dark mode |

## Raw evidence log

```
extension id oidiiofogjgbbihdkdfkphigjdnmepkp
permissions.getAll(): {"origins":[],"permissions":["activeTab","storage","scripting","sidePanel"]}
chrome://extensions item data: {"manifestErrors":[],"runtimeErrors":[],"state":"ENABLED"}
contrast segment heights: 51,51,51
console errors so far (A): []
first-run notice: AccessEase can't change this page yet. Use the button above, or click the AccessEase icon in your toolbar twice (close, then reopen) to allow just this page.
inactive dimming: {"main":"yes","size":"0.8","allsites":"1"}
chrome://extensions notice (url == null, decided from the executeScript error): Chrome doesn't let any extension change this page. Open a normal website and AccessEase will work there.
extension_pages CSP: default-src 'self'; script-src 'self'; object-src 'none'; connect-src 'none'; img-src 'self'; style-src 'self'; font-src 'self'; frame-src 'none'; base-uri 'none'; form-action 'none'
inline script test: {"ran":false,"violations":2}
fingerprint probes from a web page by static id: {"fonts/OpenDyslexic-Regular.woff2":"blocked","lib/inject.js":"blocked","manifest.json":"blocked"}
stored: {"allSites":false,"contrast":"dark","dyslexiaFont":true,"reduceMotion":true,"textScale":130,"v":1}
tab order: reset > enable-all > size-down > size > size-up > contrast=off > dyslexia > motion > allsites > undefined=undefined > reset > enable-all > size-down > size > size-up > contrast=off
260px: {"scroll":245,"client":245,"cols":1,"wide":[]}
axe light: 0 violations, 35 rules passed, incomplete: ["color-contrast"]
axe dark: 0 violations, 35 rules passed, incomplete: ["color-contrast"]
segment contrast (light): {"outlineVsFill":8.304306963707354,"shadowVsFill":1.2096125229100745,"outlineVsCard":1,"shadowVsCard":10.044993697389753,"fillVsCard":8.304306963707354,"dividerVsCard":6.150344999605371,"ring":{"outline":"rgb(255, 255, 255)","shadow":"rgb(11, 61, 145) 0px 0px 0px 6px inset","width":"2.4px"}}
segment contrast (dark): {"outlineVsFill":8.270884180120866,"shadowVsFill":1.3364033919193572,"outlineVsCard":1.0536292437638908,"shadowVsCard":10.490632960224303,"fillVsCard":7.849899980542208,"dividerVsCard":6.814500147050181,"ring":{"outline":"rgb(10, 26, 58)","shadow":"rgb(184, 208, 255) 0px 0px 0px 6px inset","width":"2.4px"}}
150%: root 24px, #intro 21px (was 14px)
dark contrast ratios: {"#intro":21,"#light-p":21,"#dark-p":21,"#light-link":11.525805817677893,"#dark-link":11.525805817677893,"#title":21}
light contrast ratios: {"#intro":21,"#light-p":21,"#dark-p":21,"#light-link":9.397615840239814,"#dark-link":9.397615840239814}
dyslexia: family=""AccessEase OpenDyslexic", sans-serif" document.fonts=["AccessEase OpenDyslexic:400:loaded","AccessEase OpenDyslexic:700:loaded"] fonts.check=true lineHeight=22.4px
reduce motion: animationDuration=1e-06s transitionDuration(#fade)=0s scrollBehavior=auto
registered content scripts: ["accessease-apply"]
fresh load + reload with panel closed: content script applied dark contrast, 110% size and loaded OpenDyslexic
live storage change reached the open tab through the content script
console errors (B): []
62.5% fixture at 150%: {"html":15,"body":21,"#h":39,"#body-p":21,"#small":18,"#box-p":21} (before {"html":10,"body":14,"#h":26,"#body-p":14,"#small":12,"#box-p":14})
fixed-height box: {"scroll":90,"client":90}
px-sized fixture at 150%: {"#title":33.6,"#intro":21}
contrast dark: {"border":["solid","1.6px","rgb(255, 255, 255)","rgb(255, 255, 255)"],"starBefore":"rgb(255, 255, 255)","starBeforeBg":"rgba(0, 0, 0, 0)","italicFont":"\"AccessEase OpenDyslexic\", sans-serif","iconFont":"FakeIconFont, serif"}
contrast dark U5: {"badgeBg":"none","chipBg":"none","ctaBg":"none","bad":["dashed","1.6px","rgb(255, 255, 255)","1.6px"],"ariaBad":["dashed","rgb(255, 255, 255)"],"good":["none"],"cta":"solid"}
contrast light: {"border":["solid","1.6px","rgb(0, 0, 0)","rgb(0, 0, 0)"],"starBefore":"rgb(0, 0, 0)","starBeforeBg":"rgba(0, 0, 0, 0)","italicFont":"\"AccessEase OpenDyslexic\", sans-serif","iconFont":"FakeIconFont, serif"}
contrast light U5: {"badgeBg":"none","chipBg":"none","ctaBg":"none","bad":["dashed","1.6px","rgb(0, 0, 0)","1.6px"],"ariaBad":["dashed","rgb(0, 0, 0)"],"good":["none"],"cta":"solid"}
after reset: {"allSites":true,"contrast":"off","dyslexiaFont":false,"reduceMotion":false,"textScale":100,"v":1}
px.html 200%: before {"h1":18,"h2":16,"h3":15,"p":14,"inp":14} after {"h1":44.8,"h2":37.8,"h3":33.6,"p":28,"inpFont":28,"inpHeight":35.20000076293945,"inpClip":false}
all-sites off: other tab cleared; sticky notice + announcement say Chrome still holds access (required permission in the granted copy cannot be removed)
all-sites on: an already-open tab was styled by the sweep
strict-CSP page: styled by the content script (contrast, size, font-family applied); document.fonts=["AccessEase OpenDyslexic:loaded","AccessEase OpenDyslexic:loaded"]; console: []
forced-colors: {"onTrack":["rgb(55, 0, 110)","1.6px","rgb(255, 255, 255)","matrix(1, 0, 0, 1, 22, 0)"],"offTrack":["rgb(255, 255, 255)","1.6px","rgb(0, 0, 0)","none"],"seg":["rgb(55, 0, 110)","rgb(255, 255, 255)","\"✓ \""],"otherSeg":"rgba(255, 255, 255, 0)","dot":["rgb(55, 0, 110)","1.6px"],"ring":["solid","2.4px","rgb(255, 255, 255)"],"forced":true}
console errors (B, final): []
screenshot docs/screenshots/1-text-size-and-dyslexia-font.png (1280x800)
screenshot docs/screenshots/2-high-contrast-dark.png (1280x800)
screenshot docs/screenshots/3-high-contrast-light.png (1280x800)
screenshot docs/screenshots/4-panel-dark-mode.png (1280x800)
```

## Not verifiable in automation

- The toolbar click (activeTab grant) and the native "allow access to all sites" prompt. The "access granted" suite uses a temp copy of the extension with the host permission granted at install (see the header of e2e/extension.e2e.test.js).
- `chrome.permissions.remove` for all-sites (a required permission cannot be removed in the granted copy), so the "turn off" cleanup is not exercised end to end (its logic is unit-tested against a chrome stub in tests/allsites.test.js).
- The real side panel chrome (docked width, focus hand-off from the toolbar). The panel page is tested in a normal tab.
- Branded Google Chrome itself (137+ ignores --load-extension); only Playwright Chromium was used.
