import {
	App,
	ButtonComponent,
	Notice,
	PluginSettingTab,
	Setting,
} from "obsidian";
import type TubeZenPlugin from "./main";
import {
	formatApiError,
	MeResponse,
	TubeZenApiError,
	TubeZenClient,
} from "./api/client";

export type FolderStructure = "flat" | "by-channel" | "by-date" | "by-tag";
export type FilenameTemplate = "title" | "date-title" | "channel-title";
export type SyncInterval = "off" | "15m" | "1h" | "6h";
export type TagWhitespaceReplacement = "-" | "_";
export type TranscriptMode = "off" | "callout" | "plain";

export interface TubeZenSettings {
	baseUrl: string;
	apiToken: string;
	syncFolder: string;
	folderStructure: FolderStructure;
	filenameTemplate: FilenameTemplate;
	tagPrefix: string;
	tagWhitespaceReplacement: TagWhitespaceReplacement;
	linkChannelTitle: boolean;
	attribution: boolean;
	syncInterval: SyncInterval;
	syncVideos: boolean;
	syncPodcasts: boolean;
	embedYouTubeVideo: boolean;
	embedPodcastPlayer: boolean;
	/**
	 * How to render the transcript, or "off" to leave it out. Off by default:
	 * transcripts average ~37KB and each one costs an extra API call, so this
	 * stays something the user opts into rather than a silent change to how
	 * much sync downloads and writes.
	 */
	transcriptMode: TranscriptMode;
	/**
	 * Keep the "[0:00]" cue markers the source captions carry. Off by default:
	 * they arrive one per caption line, which breaks sentences into fragments,
	 * and unlike the timestamps in a summary they are plain text rather than
	 * seek links, so they are not clickable.
	 */
	transcriptTimestamps: boolean;
	/**
	 * What the last successful /me call said about transcript access, or null
	 * when no call has been made yet. The plugin itself is free with any
	 * TubeZen account -- transcripts are the one part that needs a
	 * subscription -- so this exists purely to explain the empty transcript
	 * section instead of letting it look broken.
	 */
	transcriptAccess: boolean | null;
	showAdvanced: boolean;
	videoCursor: string | null;
	podcastCursor: string | null;
}

export const DEFAULT_SETTINGS: TubeZenSettings = {
	baseUrl: "https://tubezen.ai/api/v1",
	apiToken: "",
	syncFolder: "TubeZen",
	folderStructure: "flat",
	filenameTemplate: "title",
	tagPrefix: "",
	tagWhitespaceReplacement: "-",
	linkChannelTitle: true,
	attribution: true,
	syncInterval: "off",
	syncVideos: true,
	syncPodcasts: true,
	embedYouTubeVideo: true,
	embedPodcastPlayer: true,
	transcriptMode: "off",
	transcriptTimestamps: false,
	transcriptAccess: null,
	showAdvanced: false,
	videoCursor: null,
	podcastCursor: null,
};

export function migrateSettings(
	raw: Record<string, unknown>,
): { data: Record<string, unknown>; didMigrate: boolean } {
	let didMigrate = false;
	if (typeof raw.cursor === "string" && raw.videoCursor == null) {
		raw.videoCursor = raw.cursor;
		didMigrate = true;
	}
	if ("cursor" in raw) {
		delete raw.cursor;
		didMigrate = true;
	}
	return { data: raw, didMigrate };
}

const FOLDER_STRUCTURE_OPTIONS: Record<FolderStructure, string> = {
	flat: "Flat",
	"by-channel": "By channel",
	"by-date": "By date (year/month)",
	"by-tag": "By tag",
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

const TRANSCRIPT_MODE_OPTIONS: Record<TranscriptMode, string> = {
	off: "Don't include transcripts",
	callout: "Collapsible section (recommended)",
	plain: "Plain heading",
};

const TAG_WHITESPACE_OPTIONS: Record<TagWhitespaceReplacement, string> = {
	"-": "Hyphen (wind-sport)",
	_: "Underscore (wind_sport)",
};

const TRANSCRIPT_SIZE_NOTE =
	"Adds one API call per note and transcripts are long (often 30-60KB), so syncing is slower and notes are much larger.";

export class TubeZenSettingTab extends PluginSettingTab {
	private transcriptSetting: Setting | null = null;

	constructor(
		app: App,
		private readonly plugin: TubeZenPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		this.transcriptSetting = null;

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
				"Verify the token and see what your TubeZen account includes.",
			);

		const statusEl = containerEl.createDiv({ cls: "tubezen-status" });

		testRow.addButton((btn) =>
			btn.setButtonText("Run test").onClick(async () => {
				await this.runConnectionTest(statusEl, btn);
			}),
		);

		new Setting(containerEl).setName("Sync").setHeading();

		new Setting(containerEl)
			.setName("Sync videos")
			.setDesc("Include YouTube video summaries in sync.")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.syncVideos)
					.onChange(async (value) => {
						this.plugin.settings.syncVideos = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Sync podcasts")
			.setDesc("Include podcast episode summaries in sync.")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.syncPodcasts)
					.onChange(async (value) => {
						this.plugin.settings.syncPodcasts = value;
						await this.plugin.saveSettings();
					}),
			);

		this.transcriptSetting = new Setting(containerEl)
			.setName("Include transcripts")
			.setDesc(this.transcriptDesc())
			.addDropdown((dd) =>
				dd
					.addOptions(TRANSCRIPT_MODE_OPTIONS)
					.setValue(this.plugin.settings.transcriptMode)
					.onChange(async (value) => {
						this.plugin.settings.transcriptMode =
							value as TranscriptMode;
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		if (this.plugin.settings.transcriptMode !== "off") {
			new Setting(containerEl)
				.setName("Keep transcript timestamps")
				.setDesc(
					"Source captions arrive as one timestamped line per cue, which reads as fragments. Off reflows them into paragraphs. These markers are plain text, not seek links -- only summary timestamps are clickable.",
				)
				.addToggle((t) =>
					t
						.setValue(this.plugin.settings.transcriptTimestamps)
						.onChange(async (value) => {
							this.plugin.settings.transcriptTimestamps = value;
							await this.plugin.saveSettings();
						}),
				);
		}

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
			.setName("Link channel title")
			.setDesc(
				"Write channel_title as a wikilink (e.g. [[Lachie White]]) so backlinks group every video from the same creator.",
			)
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.linkChannelTitle)
					.onChange(async (value) => {
						this.plugin.settings.linkChannelTitle = value;
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
						this.plugin.rescheduleSync();
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
				.setName("Embed YouTube video")
				.setDesc(
					"Embed an inline YouTube player at the top of each video note.",
				)
				.addToggle((t) =>
					t
						.setValue(this.plugin.settings.embedYouTubeVideo)
						.onChange(async (value) => {
							this.plugin.settings.embedYouTubeVideo = value;
							await this.plugin.saveSettings();
						}),
				);

			new Setting(containerEl)
				.setName("Embed podcast player")
				.setDesc(
					"Embed an inline audio player at the top of each podcast note.",
				)
				.addToggle((t) =>
					t
						.setValue(this.plugin.settings.embedPodcastPlayer)
						.onChange(async (value) => {
							this.plugin.settings.embedPodcastPlayer = value;
							await this.plugin.saveSettings();
						}),
				);

			new Setting(containerEl)
				.setName("Tag whitespace replacement")
				.setDesc(
					"Obsidian tags can't contain spaces. Imported tags are lowercased and spaces are replaced with this character.",
				)
				.addDropdown((dd) =>
					dd
						.addOptions(TAG_WHITESPACE_OPTIONS)
						.setValue(this.plugin.settings.tagWhitespaceReplacement)
						.onChange(async (value) => {
							this.plugin.settings.tagWhitespaceReplacement =
								value as TagWhitespaceReplacement;
							await this.plugin.saveSettings();
						}),
				);

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

			new Setting(containerEl)
				.setName("Reset sync cursors")
				.setDesc(
					"Clears the saved pagination cursors for both videos and podcasts so the next sync scans from the start of each stream. To fully re-import after a backend change, also delete the existing notes from your vault before syncing.",
				)
				.addButton((btn) =>
					btn.setButtonText("Reset").onClick(async () => {
						this.plugin.settings.videoCursor = null;
						this.plugin.settings.podcastCursor = null;
						await this.plugin.saveSettings();
						new Notice("TubeZen: sync cursors reset.");
					}),
				);
		}
	}

	private transcriptDesc(): string {
		switch (this.plugin.settings.transcriptAccess) {
			case true:
				return `Your subscription includes transcript access. ${TRANSCRIPT_SIZE_NOTE}`;
			case false:
				return `Your TubeZen account does not include transcript access, so notes will contain summaries only. Everything else in the plugin works without a subscription. ${TRANSCRIPT_SIZE_NOTE}`;
			default:
				return `Requires a subscription that includes transcript access; the rest of the plugin is free with any TubeZen account. ${TRANSCRIPT_SIZE_NOTE}`;
		}
	}

	private refreshTranscriptDesc(): void {
		this.transcriptSetting?.setDesc(this.transcriptDesc());
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
			this.plugin.settings.transcriptAccess = readTranscriptAccess(me);
			await this.plugin.saveSettings();
			this.refreshTranscriptDesc();
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

function readTranscriptAccess(me: MeResponse): boolean {
	const features = me.features ?? {};
	return (
		features.transcript_access ?? features.transcript_access_enabled ?? false
	);
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

	const transcriptEnabled = readTranscriptAccess(me);
	el.createDiv({
		text: transcriptEnabled
			? "Transcript access: enabled"
			: "Transcript access: not on this plan — notes will contain summaries only.",
	});

	const sub = me.subscription;
	if (sub?.plan_slug) {
		el.createDiv({
			text: `Plan: ${sub.plan_slug}${sub.status ? ` (${sub.status})` : ""}`,
		});
	}
}

