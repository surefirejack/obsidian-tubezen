import { App, PluginSettingTab } from "obsidian";
import type TubeZenPlugin from "./main";

export type FolderStructure = "flat" | "by-channel" | "by-date";
export type FilenameTemplate = "title" | "date-title" | "channel-title";
export type SyncInterval = "off" | "15m" | "1h" | "6h";

export interface TubeZenSettings {
	baseUrl: string;
	apiToken: string;
	syncFolder: string;
	folderStructure: FolderStructure;
	filenameTemplate: FilenameTemplate;
	tagPrefix: string;
	attribution: boolean;
	syncInterval: SyncInterval;
	showAdvanced: boolean;
	cursor: string | null;
}

export const DEFAULT_SETTINGS: TubeZenSettings = {
	baseUrl: "https://tubezen.ai/api/v1",
	apiToken: "",
	syncFolder: "TubeZen",
	folderStructure: "flat",
	filenameTemplate: "title",
	tagPrefix: "tubezen/",
	attribution: true,
	syncInterval: "off",
	showAdvanced: false,
	cursor: null,
};

export class TubeZenSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: TubeZenPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("p", {
			text: "TubeZen settings UI is implemented in Phase 1.",
		});
	}
}
