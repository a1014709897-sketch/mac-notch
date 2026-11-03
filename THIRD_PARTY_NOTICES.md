# Third-party notices

<!--
Mac Notch is an independent macOS application derived in part from [Token Monitor](https://github.com/Javis603/token-monitor), Copyright (c) 2026 Javis, MIT License. It is not an official Anthropic or OpenAI application, and is not presented as an upstream Token Monitor release.
-->

<!--
The copied source is isolated under `src/vendor/token-monitor/`; that directory contains the original MIT license. `docs/upstream-manifest.json` records the base Git commit, file paths and hashes. This snapshot includes local patches: Claude Desktop activity support, Codex asynchronous question correlation, and per-session read acknowledgement and task batch progress. The new entry point, standalone UI, state aggregation, quota adapter, settings and build configuration are authored for Mac Notch. Endpoint and authentication conventions in the quota adapter were adapted from Token Monitor's Claude/Codex providers.
-->

<!--
`assets/claude.svg` and `assets/codex.svg` were extracted from Token Monitor's `assets/icons/tray-claude.svg` and `tray-codex.svg`. Generated PNGs have the same provenance. Product logos and names identify integrations; the MIT software license does not claim ownership of the product trademarks or grant trademark rights. The application itself uses a separate Mac Notch icon.
-->

The Zstandard frame parser in the vendored DSH helper credits DeepSeek Harness (MIT) in its source. It is included solely as a dependency of the Codex compressed-transcript parser; no DSH integration is enabled.

Runtime dependencies: Electron (MIT; bundles Chromium and other components with their own notices) and Koffi (MIT). Electron's binary distribution includes its licenses; Koffi's license is included in its installed package. Build-only dependencies and exact transitive versions are recorded in `package-lock.json`. Retain the framework license files when redistributing the application.
