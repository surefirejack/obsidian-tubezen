import { Plugin } from "obsidian";
import {
	DEFAULT_SETTINGS,
	SyncInterval,
	TubeZenSettings,
	TubeZenSettingTab,
} from "./settings";
import { SyncEngine } from "./sync/engine";

export default class TubeZenPlugin extends Plugin {
	settings!: TubeZenSettings;
	syncEngine!: SyncEngine;
	private intervalHandle: number | null = null;

	async onload() {
		await this.loadSettings();
		this.syncEngine = new SyncEngine(this);
		this.addSettingTab(new TubeZenSettingTab(this.app, this));

		this.addCommand({
			id: "sync-now",
			name: "Sync now",
			callback: () => {
				void this.syncEngine.run({ source: "manual" });
			},
		});

		this.app.workspace.onLayoutReady(() => this.rescheduleSync());
	}

	onunload() {
		this.clearInterval();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
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
