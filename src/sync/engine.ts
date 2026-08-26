import { App, Notice } from "obsidian";
import type TubeZenPlugin from "../main";
import {
	ExportDTO,
	formatApiError,
	SyncType,
	TubeZenApiError,
	TubeZenClient,
} from "../api/client";
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

		if (!settings.syncVideos && !settings.syncPodcasts) {
			if (opts.source === "manual") {
				new Notice("TubeZen: enable a sync type in settings.");
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

		let created = 0;
		let skipped = 0;
		let deferredError: unknown = null;

		if (settings.syncVideos) {
			try {
				const result = await this.walkType(client, seen, "video");
				created += result.created;
				skipped += result.skipped;
			} catch (err) {
				if (isFatalError(err)) throw err;
				deferredError = err;
			}
		}

		if (settings.syncPodcasts) {
			try {
				const result = await this.walkType(client, seen, "podcast");
				created += result.created;
				skipped += result.skipped;
			} catch (err) {
				throw err;
			}
		}

		if (deferredError) throw deferredError;

		return { created, skipped };
	}

	private async walkType(
		client: TubeZenClient,
		seen: Set<string>,
		type: SyncType,
	): Promise<SyncSummary> {
		const { plugin } = this;
		const { settings } = plugin;
		const cursorKey = type === "video" ? "videoCursor" : "podcastCursor";
		let cursor: string | null = settings[cursorKey];
		let created = 0;
		let skipped = 0;

		while (true) {
			const page = await client.listSaved({ type, cursor, limit: 50 });

			for (const dto of page.data) {
				if (seen.has(dto.tubezen_id)) {
					skipped++;
					continue;
				}
				await writeNote(plugin, await this.withTranscript(client, dto));
				seen.add(dto.tubezen_id);
				created++;
			}

			const next = page.meta?.next_cursor ?? null;
			if (!next) break;

			cursor = next;
			settings[cursorKey] = cursor;
			await plugin.saveSettings();
		}

		return { created, skipped };
	}

	/**
	 * Fetches the full item when the user wants transcripts, since list pages
	 * never carry the body.
	 *
	 * A failure here returns the list DTO unchanged rather than propagating:
	 * losing the transcript is worth far less than losing the note, and an
	 * account without transcript access would otherwise fail every single
	 * item of a sync.
	 */
	private async withTranscript(
		client: TubeZenClient,
		dto: ExportDTO,
	): Promise<ExportDTO> {
		if (this.plugin.settings.transcriptMode === "off") return dto;
		if (dto.transcript_available === false) return dto;

		try {
			const full = await client.getExport(dto.tubezen_id);
			return full.transcript ? full : dto;
		} catch (err) {
			console.warn(
				`[TubeZen] transcript fetch failed for ${dto.tubezen_id}`,
				err,
			);
			return dto;
		}
	}

	private handleError(err: unknown, opts: SyncOpts): void {
		if (err instanceof TubeZenApiError) {
			if (err.code === "network") {
				console.warn("[TubeZen] network error:", err.message);
				if (opts.source === "manual") {
					new Notice(`TubeZen: ${formatApiError(err)}`, 6000);
				}
				return;
			}
			new Notice(`TubeZen: ${formatApiError(err)}`, 10000);
			return;
		}
		console.error("[TubeZen] sync error", err);
		if (opts.source === "manual") {
			new Notice("TubeZen sync failed. See developer console.", 8000);
		}
	}
}

function isFatalError(err: unknown): boolean {
	if (!(err instanceof TubeZenApiError)) return false;
	return (
		err.code === "unauthenticated" ||
		err.code === "forbidden" ||
		err.code === "feature_inactive"
	);
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
