import { MarkdownView, Notice, TFile } from "obsidian";
import type TubeZenPlugin from "./main";
import {
	formatApiError,
	TubeZenApiError,
	TubeZenClient,
} from "./api/client";
import { renderNote } from "./render/markdown";

interface TubezenContext {
	tubezenId: string;
	file: TFile;
}

export function registerCommands(plugin: TubeZenPlugin): void {
	plugin.addCommand({
		id: "sync-now",
		name: "Sync now",
		callback: () => {
			void plugin.syncEngine.run({ source: "manual" });
		},
	});

	plugin.addCommand({
		id: "reimport-this-summary",
		name: "Re-import this summary",
		checkCallback: (checking) => {
			const ctx = activeTubezenContext(plugin);
			if (!ctx) return false;
			if (!checking) void reimportActive(plugin, ctx);
			return true;
		},
	});

	plugin.addCommand({
		id: "open-on-youtube",
		name: "Open original on YouTube",
		checkCallback: (checking) => {
			const url = activeYoutubeUrl(plugin);
			if (!url) return false;
			if (!checking) window.open(url, "_blank");
			return true;
		},
	});
}

function activeTubezenContext(
	plugin: TubeZenPlugin,
): TubezenContext | null {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!view?.file) return null;
	const id = plugin.app.metadataCache.getFileCache(view.file)?.frontmatter
		?.tubezen_id;
	if (typeof id !== "string" || !id) return null;
	return { tubezenId: id, file: view.file };
}

function activeYoutubeUrl(plugin: TubeZenPlugin): string | null {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!view?.file) return null;
	const fm = plugin.app.metadataCache.getFileCache(view.file)?.frontmatter;
	const url = fm?.youtube_url;
	if (typeof url === "string" && url) return url;
	const videoId = fm?.youtube_video_id;
	if (typeof videoId === "string" && videoId) {
		return `https://www.youtube.com/watch?v=${videoId}`;
	}
	return null;
}

async function reimportActive(
	plugin: TubeZenPlugin,
	ctx: TubezenContext,
): Promise<void> {
	const { settings } = plugin;
	if (!settings.apiToken) {
		new Notice("TubeZen: enter an API token in settings first.");
		return;
	}
	const client = new TubeZenClient(settings.baseUrl, settings.apiToken);
	try {
		const dto = await client.getExport(ctx.tubezenId);
		const existing = plugin.app.metadataCache.getFileCache(ctx.file)
			?.frontmatter?.imported_at;
		const importedAt =
			typeof existing === "string" && existing
				? existing
				: new Date().toISOString();
		const content = renderNote(dto, settings, { importedAt });
		await plugin.app.vault.modify(ctx.file, content);
		new Notice(`TubeZen: re-imported "${dto.title}".`);
	} catch (err) {
		if (err instanceof TubeZenApiError) {
			new Notice(`TubeZen: ${formatApiError(err)}`, 8000);
		} else {
			console.error("[TubeZen] re-import error", err);
			new Notice(
				"TubeZen: re-import failed. See developer console.",
				8000,
			);
		}
	}
}
