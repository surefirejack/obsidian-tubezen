import {
	App,
	ButtonComponent,
	PluginSettingTab,
	Setting,
} from "obsidian";
import type TubeZenPlugin from "./main";
import { MeResponse, TubeZenApiError, TubeZenClient } from "./api/client";

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

const FOLDER_STRUCTURE_OPTIONS: Record<FolderStructure, string> = {
	flat: "Flat",
	"by-channel": "By channel",
	"by-date": "By date (year/month)",
};

const FILENAME_TEMPLATE_OPTIONS: Record<FilenameTemplate, string> = {
	title: "{title}",
	"date-title": "{published_date} - {title}",
	"channel-title": "{channel} - {title}",
};

const SYNC_INTERVAL_OPTIONS: Record<SyncInterval, string> = {
	off: "Off (manual only)",
	"15m": "Every 15 minutes",
	"1h": "Every hour",
	"6h": "Every 6 hours",
};

export class TubeZenSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: TubeZenPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Authentication").setHeading();

		new Setting(containerEl)
			.setName("API token")
			.setDesc(
				'Paste a personal access token from your TubeZen dashboard ("API Tokens" page).',
			)
			.addText((text) => {
				text.inputEl.type = "password";
				text.inputEl.autocomplete = "off";
				text
					.setPlaceholder("Paste your token")
					.setValue(this.plugin.settings.apiToken)
					.onChange(async (value) => {
						this.plugin.settings.apiToken = value.trim();
						await this.plugin.saveSettings();
					});
			});

		const testRow = new Setting(containerEl)
			.setName("Test connection")
			.setDesc(
				"Verify the token and check that Obsidian export is enabled on your account.",
			);

		const statusEl = containerEl.createDiv({ cls: "tubezen-status" });

		testRow.addButton((btn) =>
			btn.setButtonText("Run test").onClick(async () => {
				await this.runConnectionTest(statusEl, btn);
			}),
		);

		new Setting(containerEl).setName("Sync").setHeading();

		new Setting(containerEl)
			.setName("Sync folder")
			.setDesc("Folder inside your vault where summaries are written.")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.syncFolder)
					.setValue(this.plugin.settings.syncFolder)
					.onChange(async (value) => {
						this.plugin.settings.syncFolder =
							value.trim() || DEFAULT_SETTINGS.syncFolder;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Folder structure")
			.addDropdown((dd) =>
				dd
					.addOptions(FOLDER_STRUCTURE_OPTIONS)
					.setValue(this.plugin.settings.folderStructure)
					.onChange(async (value) => {
						this.plugin.settings.folderStructure =
							value as FolderStructure;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Filename template")
			.addDropdown((dd) =>
				dd
					.addOptions(FILENAME_TEMPLATE_OPTIONS)
					.setValue(this.plugin.settings.filenameTemplate)
					.onChange(async (value) => {
						this.plugin.settings.filenameTemplate =
							value as FilenameTemplate;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Tag prefix")
			.setDesc(
				'Prepended to every imported tag. Leave blank for no prefix.',
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.tagPrefix)
					.setValue(this.plugin.settings.tagPrefix)
					.onChange(async (value) => {
						this.plugin.settings.tagPrefix = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Attribution footer")
			.setDesc("Append a small \"Imported from TubeZen\" footer to each note.")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.attribution)
					.onChange(async (value) => {
						this.plugin.settings.attribution = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Sync interval")
			.setDesc("How often to check for new saved videos in the background.")
			.addDropdown((dd) =>
				dd
					.addOptions(SYNC_INTERVAL_OPTIONS)
					.setValue(this.plugin.settings.syncInterval)
					.onChange(async (value) => {
						this.plugin.settings.syncInterval = value as SyncInterval;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("Advanced").setHeading();

		new Setting(containerEl)
			.setName("Show advanced settings")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.showAdvanced)
					.onChange(async (value) => {
						this.plugin.settings.showAdvanced = value;
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		if (this.plugin.settings.showAdvanced) {
			new Setting(containerEl)
				.setName("API base URL")
				.setDesc(
					"Only change for self-hosted or staging environments.",
				)
				.addText((text) =>
					text
						.setPlaceholder(DEFAULT_SETTINGS.baseUrl)
						.setValue(this.plugin.settings.baseUrl)
						.onChange(async (value) => {
							this.plugin.settings.baseUrl =
								value.trim() || DEFAULT_SETTINGS.baseUrl;
							await this.plugin.saveSettings();
						}),
				);
		}
	}

	private async runConnectionTest(
		statusEl: HTMLElement,
		btn: ButtonComponent,
	): Promise<void> {
		const { baseUrl, apiToken } = this.plugin.settings;
		statusEl.empty();
		statusEl.removeClass("tubezen-status-error", "tubezen-status-success");

		if (!apiToken) {
			statusEl.addClass("tubezen-status-error");
			statusEl.setText("Enter a token first.");
			return;
		}

		btn.setDisabled(true);
		const originalLabel = "Run test";
		btn.setButtonText("Testing…");
		statusEl.setText("Calling /me…");

		try {
			const client = new TubeZenClient(baseUrl, apiToken);
			const me = await client.me();
			statusEl.addClass("tubezen-status-success");
			renderMeResult(statusEl, me);
		} catch (err) {
			statusEl.empty();
			statusEl.addClass("tubezen-status-error");
			if (err instanceof TubeZenApiError) {
				statusEl.setText(formatApiError(err));
			} else {
				statusEl.setText(
					`Unexpected error: ${(err as Error).message ?? String(err)}`,
				);
			}
		} finally {
			btn.setDisabled(false);
			btn.setButtonText(originalLabel);
		}
	}
}

function renderMeResult(el: HTMLElement, me: MeResponse): void {
	el.empty();
	el.createDiv({ text: "Connected." });

	if (me.user?.email) {
		el.createDiv({ text: `Signed in as ${me.user.email}` });
	}

	if (me.tenant?.name) {
		el.createDiv({ text: `Workspace: ${me.tenant.name}` });
	}

	const features = me.features ?? {};
	const obsidianEnabled =
		features.obsidian_export ?? features.obsidian_export_enabled ?? false;
	el.createDiv({
		text: obsidianEnabled
			? "Obsidian export: enabled"
			: "Obsidian export is NOT enabled on this account — sync will fail with 402.",
	});

	const sub = me.subscription;
	if (sub?.plan_slug) {
		el.createDiv({
			text: `Plan: ${sub.plan_slug}${sub.status ? ` (${sub.status})` : ""}`,
		});
	}
}

function formatApiError(err: TubeZenApiError): string {
	switch (err.status) {
		case 401:
			return "Authentication failed — token is invalid or revoked. Generate a new one in your TubeZen dashboard.";
		case 403:
			return "Forbidden — this token is not associated with a tenant. Regenerate it from the API Tokens page.";
		case 0:
			return `Network error: ${err.message}`;
		default:
			return `Error ${err.status}: ${err.message}`;
	}
}
