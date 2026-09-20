# Contributing

Thanks for helping make the web easier to read. Please read `SPEC.md` and `DECISIONS.md` first; items listed as out of scope there will generally not be accepted.

## Setup
```
npm ci
npm run lint
npm test
npm run build
```
Load the `extension/` folder unpacked at `chrome://extensions` (Developer mode) to try changes.

## Guidelines
- No runtime dependencies, network requests, analytics or remote code.
- Do not add permissions without discussion; see the permissions table in `SPEC.md`.
- The side panel must stay fully keyboard and screen-reader accessible.
- Add or update unit tests for pure modules (settings, CSS generation, in-page injection).
- Update `CHANGELOG.md` for user-visible changes.

## Pull requests
Open an issue first for larger changes. Keep PRs focused and fill in the PR template. By contributing you agree your work is licensed under the MIT License.
