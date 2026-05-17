import { App, normalizePath, TFile } from "obsidian";
import type TubeZenPlugin from "../main";
import type { ExportDTO } from "../api/client";
import type { TubeZenSettings } from "../settings";
import { renderNote } from "./markdown";

export async function writeNote(
	plugin: TubeZenPlugin,
	dto: ExportDTO,
): Promise<TFile> {
	const { app, settings } = plugin;
	const folder = resolveFolder(dto, settings);
	await ensureFolder(app, folder);
	const filename = resolveFilename(dto, settings);
	const path = uniquePath(app, folder, filename);
	const content = renderNote(dto, settings, {
		importedAt: new Date().toISOString(),
	});
	return await app.vault.create(path, content);
}

function resolveFolder(
	dto: ExportDTO,
	settings: TubeZenSettings,
): string {
	const root = (settings.syncFolder.trim() || "TubeZen").replace(
		/^\/+|\/+$/g,
		"",
	);
	switch (settings.folderStructure) {
		case "flat":
			return normalizePath(root);
		case "by-channel":
			return normalizePath(
				`${root}/${sanitizePathSegment(dto.channel_title)}`,
			);
		case "by-date": {
			const ym = dto.published_at?.slice(0, 7);
			if (!ym || !ym.includes("-")) return normalizePath(root);
			const [year, month] = ym.split("-");
			return normalizePath(`${root}/${year}/${month}`);
		}
		case "by-tag": {
			const tag = dto.saved_tag?.trim();
			const segment = tag
				? sanitizePathSegment(tag)
				: "_uncategorized";
			return normalizePath(`${root}/${segment}`);
		}
	}
}

function resolveFilename(
	dto: ExportDTO,
	settings: TubeZenSettings,
): string {
	const title = sanitizePathSegment(dto.title);
	switch (settings.filenameTemplate) {
		case "title":
			return title;
		case "date-title": {
			const date = dto.published_at?.slice(0, 10);
			return date ? `${date} - ${title}` : title;
		}
		case "channel-title": {
			const channel = sanitizePathSegment(dto.channel_title);
			return `${channel} - ${title}`;
		}
	}
}

async function ensureFolder(app: App, path: string): Promise<void> {
	if (!path || path === "/" || app.vault.getAbstractFileByPath(path)) {
		return;
	}
	try {
		await app.vault.createFolder(path);
	} catch (err) {
		if (!app.vault.getAbstractFileByPath(path)) throw err;
	}
}

function uniquePath(app: App, folder: string, basename: string): string {
	const initial = normalizePath(`${folder}/${basename}.md`);
	if (!app.vault.getAbstractFileByPath(initial)) return initial;
	for (let i = 2; i < 1000; i++) {
		const candidate = normalizePath(`${folder}/${basename} ${i}.md`);
		if (!app.vault.getAbstractFileByPath(candidate)) return candidate;
	}
	throw new Error(`Could not find unique filename for "${basename}"`);
}

function sanitizePathSegment(s: string): string {
	const cleaned = (s ?? "")
		.replace(/[\\/:*?"<>|#^\[\]]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return cleaned.slice(0, 200) || "Untitled";
}
