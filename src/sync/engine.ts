import { App, Notice } from "obsidian";
import type TubeZenPlugin from "../main";
import { TubeZenApiError, TubeZenClient } from "../api/client";
import { writeNote } from "../render/writer";

type SyncSource = "manual" | "interval";

interface SyncOpts {
	source: SyncSource;
}

interface SyncSummary {
	created: number;
	skipped: number;
}

export class SyncEngine {
	private inFlight = false;

	constructor(private readonly plugin: TubeZenPlugin) {}

	async run(opts: SyncOpts): Promise<void> {
		const { settings } = this.plugin;

		if (!settings.apiToken) {
			if (opts.source === "manual") {
				new Notice("TubeZen: enter an API token in settings first.");
			}
			return;
		}

		if (this.inFlight) {
			if (opts.source === "manual") {
				new Notice("TubeZen: sync already in progress.");
			}
			return;
		}

		this.inFlight = true;
		try {
			const summary = await this.walk();
			if (opts.source === "manual" || summary.created > 0) {
				new Notice(
					`TubeZen: ${summary.created} new, ${summary.skipped} already in vault.`,
				);
			}
		} catch (err) {
			this.handleError(err, opts);
		} finally {
			this.inFlight = false;
		}
	}

	private async walk(): Promise<SyncSummary> {
		const { plugin } = this;
		const { settings } = plugin;
		const client = new TubeZenClient(settings.baseUrl, settings.apiToken);
		const seen = buildTubezenIndex(plugin.app);

		let cursor: string | null = settings.cursor ?? null;
		let created = 0;
		let skipped = 0;

		while (true) {
			const page = await client.listSaved({ cursor, limit: 50 });

			for (const dto of page.data) {
				if (seen.has(dto.tubezen_id)) {
					skipped++;
					continue;
				}
				await writeNote(plugin, dto);
				seen.add(dto.tubezen_id);
				created++;
			}

			const next = page.meta?.next_cursor ?? null;
			if (!next) break;

			cursor = next;
			settings.cursor = cursor;
			await plugin.saveSettings();
		}

		return { created, skipped };
	}

	private handleError(err: unknown, opts: SyncOpts): void {
		if (err instanceof TubeZenApiError) {
			switch (err.code) {
				case "unauthenticated":
					new Notice(
						"TubeZen: token invalid. Re-paste it in settings.",
						8000,
					);
					return;
				case "forbidden":
					new Notice(
						"TubeZen: token missing tenant. Regenerate it.",
						8000,
					);
					return;
				case "feature_inactive": {
					const body = err.body as
						| { upgrade_url?: string }
						| undefined;
					const tail = body?.upgrade_url
						? ` Upgrade: ${body.upgrade_url}`
						: "";
					new Notice(
						`TubeZen: Pro feature not enabled.${tail}`,
						10000,
					);
					return;
				}
				case "network":
					if (opts.source === "manual") {
						new Notice(
							`TubeZen: network error — ${err.message}`,
							6000,
						);
					}
					console.warn("[TubeZen] network error:", err.message);
					return;
				default:
					new Notice(
						`TubeZen sync failed: ${err.message}`,
						8000,
					);
					return;
			}
		}
		console.error("[TubeZen] sync error", err);
		if (opts.source === "manual") {
			new Notice("TubeZen sync failed. See developer console.", 8000);
		}
	}
}

function buildTubezenIndex(app: App): Set<string> {
	const ids = new Set<string>();
	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		const id = cache?.frontmatter?.tubezen_id;
		if (typeof id === "string") ids.add(id);
	}
	return ids;
}
