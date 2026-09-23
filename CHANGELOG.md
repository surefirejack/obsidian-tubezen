# Changelog

## 1.0.1

- Seek links in reading view are now built with Obsidian's `createEl` helper rather than `document.createElement`.
- Frontmatter is read through a typed accessor, so a note with unexpected property types can no longer produce an untyped value.
- A failure syncing one content type no longer discards an error already recorded for the other; both streams still run.
- Dropped the `builtin-modules` build dependency. The plugin imports no Node built-ins, so nothing needed excluding.
- Release assets now carry GitHub build provenance attestations, so anyone can verify they were built from this repository.

## 1.0.0

First public release.

- Imports the YouTube videos and podcast episodes you have saved in TubeZen as notes, with title, channel, tags and dates as frontmatter properties and the summary as the body.
- Callout header with the video thumbnail or an inline audio player, and key takeaways whose timestamps seek the embedded player.
- One-way sync that only adds what is new, so edited notes are left alone. Videos and podcasts paginate independently.
- Background sync every 15 minutes, hour or six hours, or on demand from the command palette.
- Four folder structures (flat, by channel, by date, by saved category), three filename templates and an optional tag prefix.
- Optional transcript import, in a callout or as plain text, with or without caption timestamps.
- Desktop and mobile.
