# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Obsidian community plugin that imports YouTube summaries from TubeZen (a SaaS project at `tubezen.ai`) into a user's vault. The plugin is the public-facing client for the TubeZen export API — the backend lives in a separate repo (`yt-research-saas`).

This repo will be submitted to the Obsidian community plugin directory, which requires a public GitHub repo for review.

## Current state

The repo is a scaffold-in-progress. As of this writing only `docs/tubezen-api.md` exists. The intended starting point is `obsidianmd/obsidian-sample-plugin` (TypeScript + esbuild). When source lands, update this file with build/test/lint commands.

## The API contract is load-bearing

`docs/tubezen-api.md` is the v1 contract between this plugin and the TubeZen backend. Read it before writing any code that touches the network. Key constraints:

- The export DTO is versioned (`version: 1`). Once the plugin ships to the Obsidian directory the v1 shape is a public API — do not mutate it. Backend changes go in a `v2` endpoint.
- `tubezen_id` (format `tvi_{interaction_id}`) is the dedup key. Sync must be idempotent: check Obsidian's metadata cache for an existing frontmatter `tubezen_id` before writing.
- `/exports/saved` is cursor-paginated and ordered `(updated_at asc, id asc)` so re-saves resurface — the plugin persists the cursor in plugin data and resumes from it.
- `key_takeaways` and `tubezen_url` are reserved `null` fields the backend will populate later. Tolerate `null` today; don't assume the eventual shape.
- Auth is a Sanctum bearer token the user pastes from the TubeZen Filament dashboard. Specific error codes (`401`, `402`, `403`, `404`) each map to a distinct UI surface — see the table in `docs/tubezen-api.md`.

## Plugin-specific gotchas

- Use `normalizePath()` from the Obsidian API for all vault paths. Skipping this is the most common reason Obsidian reviewers reject plugins.
- Sync is create-only in v1 (no two-way sync, no editing back to TubeZen).
- Pro-gated from launch — the backend returns `402 feature_inactive` with an `upgrade_url` when the user's tenant lacks the feature. Surface the upgrade URL rather than failing silently.

## Scope discipline

Explicitly out of scope for v1 (do not let these creep in):

- Structured key takeaways with timestamps (deferred to backend Phase 4)
- Two-way sync or creating summaries from Obsidian
- Tag normalization across the user's library
- Custom template editor — only the preset folder structures (Flat / By channel / By date) and filename templates
- OAuth device flow — paste-token is the v1 auth UX
- Cloud folder integration
