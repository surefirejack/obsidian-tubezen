import { Plugin } from "obsidian";
import {
	DEFAULT_SETTINGS,
	migrateSettings,
	SyncInterval,
	TubeZenSettings,
	TubeZenSettingTab,
} from "./settings";
import { SyncEngine } from "./sync/engine";
import { registerCommands } from "./commands";
import { buildPodcastSeekProcessor } from "./render/podcastSeek";
import { buildVideoSeekProcessor } from "./render/videoSeek";

export default class TubeZenPlugin extends Plugin {
	settings!: TubeZenSettings;
	syncEngine!: SyncEngine;
	private intervalHandle: number | null = null;

	async onload() {
		await this.loadSettings();
		this.syncEngine = new SyncEngine(this);
		this.addSettingTab(new TubeZenSettingTab(this.app, this));
		registerCommands(this);
		this.registerMarkdownPostProcessor(buildPodcastSeekProcessor(this.app));
		this.registerMarkdownPostProcessor(buildVideoSeekProcessor(this.app));
		this.app.workspace.onLayoutReady(() => this.rescheduleSync());
	}

	onunload() {
		this.clearInterval();
	}

	async loadSettings() {
		const raw = ((await this.loadData()) ?? {}) as Record<string, unknown>;
		const { data, didMigrate } = migrateSettings(raw);
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			data,
		) as TubeZenSettings;
		if (didMigrate) await this.saveSettings();
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	rescheduleSync(): void {
		this.clearInterval();
		const ms = intervalToMs(this.settings.syncInterval);
		if (ms == null) return;
		this.intervalHandle = window.setInterval(() => {
			void this.syncEngine.run({ source: "interval" });
		}, ms);
		this.registerInterval(this.intervalHandle);
	}

	private clearInterval(): void {
		if (this.intervalHandle != null) {
			window.clearInterval(this.intervalHandle);
			this.intervalHandle = null;
		}
	}
}

function intervalToMs(interval: SyncInterval): number | null {
	switch (interval) {
		case "off":
			return null;
		case "15m":
			return 15 * 60 * 1000;
		case "1h":
			return 60 * 60 * 1000;
		case "6h":
			return 6 * 60 * 60 * 1000;
	}
}
