# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-09-20

### Added
- Side panel. Make any web page easier to read: bigger text, high contrast, a dyslexia-friendly font and calmer motion.
- Text size slider (100-200%, step 10).
- High contrast modes: black-on-white and white-on-black.
- Dyslexia-friendly font toggle (bundled OpenDyslexic) with more line spacing and modest word spacing (no letter-spacing).
- Reduce animations toggle (no animations, transitions or smooth scrolling).
- Optional "Apply on all sites" mode using an optional host permission.
- Reset my settings (with a visible confirmation), system dark/light theme, full keyboard and ARIA support, Windows forced-colors support.
- Status line showing whether AccessEase is active on the current page, with an "Apply on all sites" button.
- Settings changed in one window appear in other open panels.
- Turning "Apply on all sites" on styles already-open tabs; turning it off clears every tab including the active one and reports honestly if Chrome keeps the permission or a tab could not be cleared.
- Heading and input floors for text size on px-sized sites; contrast mode flattens gradient buttons/badges and marks invalid fields with a dashed outline.
- No accounts, no backend, no tracking, no network requests.
