import { Plugin } from "obsidian";
import {
	DEFAULT_SETTINGS,
	TubeZenSettings,
	TubeZenSettingTab,
} from "./settings";

export default class TubeZenPlugin extends Plugin {
	settings!: TubeZenSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new TubeZenSettingTab(this.app, this));

		this.addCommand({
			id: "sync-now",
			name: "Sync now",
			callback: () => {
				// Phase 3: invoke sync engine
			},
		});
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
}
