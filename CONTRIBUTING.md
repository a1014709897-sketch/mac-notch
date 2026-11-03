# Contributing

Use Node 24 on macOS. Run `npm ci`, `npm run verify`, `npm run demo`. Keep v0.1 limited to Claude/Codex and macOS. Submit focused changes with tests for behavioral bugs and screenshots from the demo for layout changes.

Do not test layout changes by replacing another installed application. Do not include credentials or user transcripts in fixtures. State transitions must distinguish unknown, running, waiting and confirmed completion. Do not infer success from missing files or idle processes.

Vendored source requires a provenance update in `docs/upstream-manifest.json`, preservation of licensing, and an explicit explanation of any local patch. Do not edit files merely to remove attribution.
