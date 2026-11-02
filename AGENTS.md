# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Approved product scope, 2 November 2026

The owner narrowed the prototype after real provider checks: incident explanations, substitutions, starting lineups/formation, score/status and possession only when supplied. Shot statistics and attacking-output comparisons are deferred. Do not restore them through UI, suggestions or AI evidence. Existing snapshot fields may remain for compatibility. No historical controls or claimed broadcaster integration. See SCOPE.md.

## Visual and copy direction, 2 November 2026

Use the supplied FanCode screenshots as direction for a charcoal viewing surface, orange interaction accents and compact football information, while retaining MatchSide branding. Avoid prototype badges, construction-status language and repeated explanatory slogans in the fan interface. Preserve factual live/recorded status, missing-data messages and source access. Do not imply an official FanCode integration.

Keep the question field free of a visible Enter/Shift+Enter instruction. Enter submits, Shift+Enter inserts a new line, and IME confirmation remains guarded.
