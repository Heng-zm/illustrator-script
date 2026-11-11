# Changelog

All notable changes to the **Ozo Tools** Illustrator Plugin Suite will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.6.48] - 2026-11-11

### Added
- **Catalog Sorting**: Added a Default / A–Z / Z–A sort control to the panel toolbar and `Alt+S` shortcut, with the chosen order remembered across sessions. Favorites stay pinned above the rest while the selected order applies within each group.
- **Bilingual Sort UI**: Added English and Khmer labels, tooltip and toast feedback for the new sort control, plus a Keyboard Help entry.

---

## [2.6.2] - 2026-11-03

### Fixed
- **Nesting Bridge Return Type**: Fixed a critical bug in `Script all/Nesting.jsx` where `__ozoHeadlessResult` was assigned a JSON-stringified string instead of a plain object, causing double serialization in `hostscript.jsx` and resulting in an undefined response in the CEP panel.
- **ExtendScript JSON Dependency**: Replaced `JSON.parse` in `Nesting.jsx` with `OZO.parseJson` and added `OZO.jsonStringify` and `OZO.parseJson` to `OzoShared.jsxinc`. ExtendScript engines lack native JSON support.
- **ExtendScript Syntax & Bridge Linter**: Added a build-time AST/regex lint check to `tools/check-syntax.js` rejecting bare `JSON.` and eval-style `new Function()` in `Script all/`.
- **Single Selection Count**: Fixed `doc.selection.length` being undefined when exactly one artwork object is selected in Illustrator; now accurately returns count `1` and includes `itemCount`.
- **Installer Version Drift**: Added `Install as Plugin.jsx` to the `sync-version.ps1` target list to ensure the setup dialog header version stays in lockstep with `version.json`.
- **Release Automation Split**: Split workflow into `ci.yml` (push/pull_request to `main` for testing, syntax checks, and artifact archiving without publishing) and `release.yml` (gated strictly on `v*` tags with tag-to-HEAD verification).
- **Security Hardening**: Replaced `new Function("return " + json)` in `hostscript.jsx` with a strict, recursive-descent `ozoJsonParse` parser to eliminate eval-based execution of bridge parameters.
- **Setup & Updater Resilience**:
  - `setup.bat`: Skips download when the installed version matches the latest release tag.
  - Verifies that `version.json` inside downloaded release archives matches the expected release tag before extracting.
  - Automatically prunes obsolete/stale files in target extension directories to prevent removed tools from persisting.
  - Implements atomic backup and rollback if installation or update encounters an error.
- **Bilingual i18n Gaps**: Translated previously hardcoded English strings in embedded forms (Saved/Unsaved tags, artboard tags, separate/multi-page options, export quality) into Khmer.

### Added
- **macOS Parity Launcher**: Added `setup.command` for macOS users, providing a one-click terminal launcher with PlayerDebugMode configuration, CEP extension installation, menu scripts deployment, and updates.
- **Unit Test Harness**: Added `tools/test-hostscript.js` running in a Node.js VM with Illustrator DOM stubs covering JSON serialization/parsing roundtrips, prototype-pollution defenses, document status calculation, unit conversion, and naming template parity.
- **Root License**: Added official MIT License file to repository root.

---

## [2.6.1] - 2026-11-03

### Changed
- Replaced emoji UI characters with high-resolution, theme-adaptive SVG vector icons across the CEP panel interface.
- Repaired corrupted unicode escape sequences in ExtendScript source files.
- Added live document status monitoring with auto-refresh on document focus and selection changes.

---

## [2.6.0] - 2026-11-02

### Added
- Embedded **Nesting**, **Icon Importer**, and **Script Launcher** directly into the CEP dock panel, completing 100% embedded UI coverage for all suite tools.

---

## [2.5.0] - 2026-11-01

### Added
- Embedded **Pathfinder Pro**, **New Guide Layout**, and **Object Repeat** into the CEP dock panel with real-time parameter controls.

---

## [2.4.2] - 2026-10-31

### Added
- Embedded **Print Job Info**, **Object Count**, and **Sequential Numbering** into the CEP dock panel.

---

## [2.4.1] - 2026-10-30

### Added
- Embedded **CutContour Generator** and **Smart Dimension** directly into the dock panel interface.

---

## [2.4.0] - 2026-10-28

### Added
- Initial release of the native Adobe Illustrator CEP dock panel (`Window > Extensions > Ozo Tools`).
- 4-tier dynamic brightness theme synchronization matching Illustrator UI.
- Bilingual Khmer / English live toggle.
- Favorites filtering, instant tool search, and grid/list view persistence.
