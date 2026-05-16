# TubeZen for Obsidian

Import YouTube summaries from [TubeZen](https://tubezen.ai) into your Obsidian vault. Each saved video becomes a note with full frontmatter, a callout header, and the summary body — ready to link, tag, and reference like any other note.

<!--
TODO: add 2–4 screenshots once captured, in this order:
1. docs/img/settings.png        — Settings tab showing a successful "Run test" result
2. docs/img/synced-note.png     — A synced note in reading view (callout + frontmatter visible)
3. docs/img/commands.png        — Command palette filtered to "TubeZen"
4. docs/img/folder-by-tag.png   — File explorer showing TubeZen/<tag>/ organization (optional)
-->

## Features

- **One-way sync** of TubeZen summaries you've explicitly marked as saved for export.
- **Idempotent** — re-running sync only fetches new items; existing notes are left alone unless explicitly re-imported.
- **Cursor-based pagination** with automatic resume across syncs.
- **Four folder organizations**: flat, by channel, by date, or by saved category tag.
- **Three filename templates**: title, date + title, channel + title.
- **Background sync** at 15-minute / 1-hour / 6-hour intervals, or fully manual.
- **Mobile + desktop.**

## Requirements

- Obsidian **1.5.0** or later
- A [TubeZen](https://tubezen.ai) account with the **Obsidian export** feature enabled on your subscription
- A personal access token generated from your TubeZen dashboard

## Installation

### From the community plugins directory

In Obsidian: Settings → Community plugins → Browse → search "TubeZen" → Install → Enable.

### Manual install

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [release](https://github.com/surefirejack/obsidian-tubezen/releases).
2. Create a folder named `tubezen/` inside `<your-vault>/.obsidian/plugins/`.
3. Drop the three files into that folder.
4. In Obsidian: Settings → Community plugins → Reload plugins, then toggle **TubeZen** on.

## Setup

1. Open Settings → TubeZen.
2. In your [TubeZen dashboard](https://tubezen.ai), open the API Tokens page, generate a new token, copy it.
3. Paste the token into the **API token** field.
4. Click **Run test** under "Test connection". You should see your account info and `Obsidian export: enabled`.
5. Pick a folder organization, filename template, and sync interval.
6. Open the command palette (Cmd/Ctrl + P) and run **TubeZen: Sync now**.

## Settings reference

| Setting | What it does |
|---|---|
| **API token** | Bearer token from your TubeZen dashboard. Stored locally in the plugin's data file. |
| **Test connection** | Calls `/me` and reports your user, workspace, plan, and whether Obsidian export is active. |
| **Sync folder** | Vault folder where summaries are written. Default `TubeZen`. |
| **Folder structure** | `Flat` / `By channel` / `By date (year/month)` / `By tag`. "By tag" uses your saved category, with `_uncategorized/` as the fallback for untagged items. |
| **Filename template** | `{title}` / `{published_date} - {title}` / `{channel} - {title}`. |
| **Tag prefix** | Prepended to every imported tag. Default is empty — tags pass through raw. |
| **Attribution footer** | Appends an "Imported from TubeZen" line to each note. |
| **Sync interval** | `Off` (manual only) / 15 minutes / 1 hour / 6 hours. |

### Advanced settings

| Setting | What it does |
|---|---|
| **API base URL** | Defaults to `https://tubezen.ai/api/v1`. Change only for self-hosted or staging environments. |
| **Reset sync cursor** | Clears the saved pagination cursor so the next sync scans your saved exports from the beginning. To fully re-import after a backend change, also delete the existing notes from your vault before syncing. |

## Commands

| Command | When available | What it does |
|---|---|---|
| **TubeZen: Sync now** | Always | Fetches saved summaries since the last cursor position. |
| **TubeZen: Re-import this summary** | When the active note has a `tubezen_id` in frontmatter | Refetches and **overwrites** the active note with the latest version from TubeZen. |
| **TubeZen: Open original on YouTube** | When the active note has `youtube_url` or `youtube_video_id` in frontmatter | Opens the source video in your default browser. |

> **Re-import is destructive.** Any manual edits below the summary are wiped. Obsidian's Cmd/Ctrl+Z does not undo plugin file modifications.

## Note format

Each synced note looks like this:

````markdown
---
tubezen_id: "tvi_42"
title: "How to Build a Plugin"
youtube_video_id: "abc123"
youtube_url: "https://youtube.com/watch?v=abc123"
channel_title: "Fireship"
channel_url: "https://youtube.com/@fireship"
thumbnail_url: "https://i.ytimg.com/vi/abc123/hqdefault.jpg"
published_at: "2026-05-01T12:00:00Z"
summarized_at: "2026-05-10T08:30:00Z"
duration_seconds: 420
category: "Tutorials"
tags:
  - "react"
  - "tutorial"
---

> [!info] How to Build a Plugin
> ![](https://i.ytimg.com/vi/abc123/hqdefault.jpg)
>
> **Channel:** [[Fireship]]
> **Published:** 2026-05-01
> **Duration:** 7m
> **Watch:** [YouTube](https://youtube.com/watch?v=abc123)

## Summary

<summary content from TubeZen>

---

*Imported from [TubeZen](https://tubezen.ai) on 2026-05-16.*
````

The `tubezen_id` frontmatter field is the dedup anchor. On every sync the plugin scans the vault for existing notes carrying this id and skips anything already imported.

## Privacy & data handling

- **Your API token is stored as plain text** in `<your-vault>/.obsidian/plugins/tubezen/data.json`. Obsidian doesn't expose a cross-platform secure-storage API, so this is consistent with other API-based community plugins. Treat your `.obsidian/plugins/tubezen/` folder accordingly.
- **No analytics, no telemetry.** The plugin makes network requests only to your configured TubeZen base URL, and only when triggered by you (manual sync, test connection, re-import) or by the configured background interval.
- **No third-party services.** The plugin does not phone home to any URL except your TubeZen instance.

## Network endpoints

The plugin uses Obsidian's `requestUrl` API (mobile-safe) and hits only these endpoints on your configured TubeZen host:

| Method | Endpoint | When |
|---|---|---|
| `GET` | `/api/v1/me` | When you click "Test connection" |
| `GET` | `/api/v1/exports/saved?cursor=…&limit=50` | Every sync, paginated until the stream ends |
| `GET` | `/api/v1/exports/{interaction_id}` | When you run "Re-import this summary" |

All requests include `Authorization: Bearer <your-token>`.

## Development

```bash
npm install
npm run dev        # watch mode, rebuilds main.js on save
npm run build      # production build (typecheck + minify)
npm run typecheck
```

To develop against a real vault, symlink the build artifacts into a test vault's plugins folder:

```bash
mkdir -p "<vault>/.obsidian/plugins/tubezen"
ln -sf "$(pwd)/main.js"       "<vault>/.obsidian/plugins/tubezen/main.js"
ln -sf "$(pwd)/manifest.json" "<vault>/.obsidian/plugins/tubezen/manifest.json"
ln -sf "$(pwd)/styles.css"    "<vault>/.obsidian/plugins/tubezen/styles.css"
```

Toggle the plugin off and on in Community plugins to reload after each rebuild, or install [Hot Reload](https://github.com/pjeby/hot-reload) and create an empty `.hotreload` file in the plugin folder for automatic reloads.

## Roadmap

Deferred from v1, intentionally scoped out:

- Structured key takeaways with timestamps (pending backend support)
- Two-way sync / creating summaries from Obsidian
- Custom filename / folder template editor (beyond the three preset combinations)
- OAuth device flow (paste-token is the v1 auth UX)

## License

[MIT](./LICENSE)
