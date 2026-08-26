import type { ExportDTO, PodcastExportDTO } from "../api/client";
import type { TubeZenSettings } from "../settings";

export interface RenderOpts {
	importedAt: string;
}

export function renderNote(
	dto: ExportDTO,
	settings: TubeZenSettings,
	opts: RenderOpts,
): string {
	const sections: string[] = [
		buildFrontmatter(dto, settings, opts),
		buildCallout(dto),
	];
	const embed = buildEmbed(dto, settings);
	if (embed) sections.push(embed);
	sections.push(buildSummary(dto));
	const transcript = buildTranscript(dto, settings);
	if (transcript) sections.push(transcript);
	if (settings.attribution) sections.push(buildFooter(opts.importedAt));
	return sections.join("\n\n") + "\n";
}

function buildFrontmatter(
	dto: ExportDTO,
	settings: TubeZenSettings,
	opts: RenderOpts,
): string {
	const tags = (dto.tags ?? []).map((t) => normalizeTag(t, settings));
	const channelTitle = settings.linkChannelTitle && dto.channel_title
		? `[[${sanitizeWikilink(dto.channel_title)}]]`
		: dto.channel_title;
	const lines: string[] = ["---"];
	lines.push(yamlScalar("tubezen_id", dto.tubezen_id));
	lines.push(yamlScalar("content_type", dto.content_type));
	lines.push(yamlScalar("title", dto.title));
	lines.push(yamlScalar("youtube_video_id", dto.youtube_video_id));
	lines.push(yamlScalar("youtube_url", dto.youtube_url));
	lines.push(yamlNumberOrNull("season_number", dto.season_number));
	lines.push(yamlNumberOrNull("episode_number", dto.episode_number));
	lines.push(yamlScalar("channel_title", channelTitle));
	lines.push(yamlScalar("channel_url", dto.channel_url));
	lines.push(yamlScalar("published_at", dto.published_at));
	lines.push(yamlScalar("summarized_at", dto.summarized_at));
	lines.push(yamlScalar("imported_at", opts.importedAt));
	lines.push(`duration_seconds: ${dto.duration_seconds}`);
	lines.push(yamlScalar("category", dto.saved_tag));
	lines.push(yamlList("tags", tags));
	lines.push("---");
	return lines.join("\n");
}

function buildCallout(dto: ExportDTO): string {
	const lines: string[] = [`> [!info] ${dto.title}`];
	if (dto.thumbnail_url) {
		lines.push(`> ![](${dto.thumbnail_url})`);
		lines.push(">");
	}
	lines.push(
		`> **Channel:** [[${sanitizeWikilink(dto.channel_title)}]]`,
	);
	const publishedDate = dto.published_at?.slice(0, 10);
	if (publishedDate) {
		lines.push(`> **Published:** ${publishedDate}`);
	}
	if (dto.duration_seconds > 0) {
		lines.push(`> **Duration:** ${formatDuration(dto.duration_seconds)}`);
	}

	if (dto.content_type === "podcast") {
		const seasonEp = formatSeasonEpisode(dto);
		if (seasonEp) lines.push(`> **${seasonEp}**`);
		if (dto.audio_url) {
			lines.push(`> **Listen:** [Audio](${dto.audio_url})`);
		}
	} else {
		if (dto.youtube_url) {
			lines.push(`> **Watch:** [YouTube](${dto.youtube_url})`);
		}
	}

	return lines.join("\n");
}

function buildEmbed(
	dto: ExportDTO,
	settings: TubeZenSettings,
): string | null {
	if (dto.content_type === "youtube") {
		if (!settings.embedYouTubeVideo || !dto.youtube_url) return null;
		return `![](${dto.youtube_url})`;
	}
	if (!settings.embedPodcastPlayer || !dto.audio_url) return null;
	return `<audio controls src="${escapeHtmlAttr(dto.audio_url)}"></audio>`;
}

function escapeHtmlAttr(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function formatSeasonEpisode(dto: PodcastExportDTO): string | null {
	const parts: string[] = [];
	if (dto.season_number != null) parts.push(`Season ${dto.season_number}`);
	if (dto.episode_number != null) parts.push(`Episode ${dto.episode_number}`);
	return parts.length ? parts.join(" · ") : null;
}

function buildSummary(dto: ExportDTO): string {
	return `## Summary\n\n${dto.summary_markdown ?? ""}`;
}

/**
 * Renders the transcript, when one was fetched and the user asked for it.
 *
 * The callout form is the default because transcripts routinely run past
 * 30KB: collapsed, the note still reads as a summary, and the raw text is one
 * click away rather than burying everything below it.
 */
function buildTranscript(
	dto: ExportDTO,
	settings: TubeZenSettings,
): string | null {
	if (settings.transcriptMode === "off") return null;

	const raw = dto.transcript?.trim();
	if (!raw) return null;

	const body = settings.transcriptTimestamps
		? raw
		: reflowTranscript(raw);
	if (!body) return null;

	if (settings.transcriptMode === "plain") {
		return `## Transcript\n\n${body}`;
	}

	// Every line needs the "> " marker, including blank ones, or the callout
	// terminates at the first empty line and the rest spills into the note.
	const quoted = body
		.split(/\r?\n/)
		.map((line) => (line.length ? `> ${line}` : ">"))
		.join("\n");

	return `> [!quote]- Transcript\n${quoted}`;
}

/**
 * Turns caption cues into readable prose.
 *
 * Source transcripts arrive as one "[0:00] some words" line per caption cue,
 * so sentences are split every few seconds and the result reads as fragments.
 * Dropping the markers and rejoining lets sentences run to their natural end;
 * grouping the result into paragraphs keeps a 40-minute transcript from
 * rendering as one unbroken wall of text.
 */
function reflowTranscript(raw: string): string {
	const words = raw
		// Cue markers: [0:00], [12:34], [1:02:03].
		.replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]/g, " ")
		// Caption artefacts the source inserts, e.g. [Music], [Applause].
		.replace(/\[[A-Za-z][^\]\n]{0,30}\]/g, " ")
		.replace(/\s+/g, " ")
		.trim();

	if (!words) return "";

	// No sentence punctuation survives in most auto-captions, so paragraphs are
	// grouped by word count rather than by sentence.
	const WORDS_PER_PARAGRAPH = 110;
	const tokens = words.split(" ");
	const paragraphs: string[] = [];

	for (let i = 0; i < tokens.length; i += WORDS_PER_PARAGRAPH) {
		paragraphs.push(tokens.slice(i, i + WORDS_PER_PARAGRAPH).join(" "));
	}

	return paragraphs.join("\n\n");
}

function buildFooter(importedAt: string): string {
	const day = importedAt.slice(0, 10);
	return `---\n\n*Imported from [TubeZen](https://tubezen.ai) on ${day}.*`;
}

function normalizeTag(tag: string, settings: TubeZenSettings): string {
	const replacement = settings.tagWhitespaceReplacement;
	const cleaned = tag.toLowerCase().replace(/\s+/g, replacement);
	const prefix = settings.tagPrefix;
	if (!prefix || cleaned.startsWith(prefix)) return cleaned;
	return `${prefix}${cleaned}`;
}

function yamlScalar(key: string, value: string | null | undefined): string {
	if (value == null) return `${key}: null`;
	return `${key}: ${yamlString(value)}`;
}

function yamlNumberOrNull(key: string, value: number | null): string {
	if (value == null) return `${key}: null`;
	return `${key}: ${value}`;
}

function yamlList(key: string, items: string[]): string {
	if (!items.length) return `${key}: []`;
	return (
		`${key}:\n` +
		items.map((item) => `  - ${yamlString(item)}`).join("\n")
	);
}

function yamlString(s: string): string {
	const escaped = s
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\r")
		.replace(/\t/g, "\\t");
	return `"${escaped}"`;
}

function sanitizeWikilink(s: string): string {
	return s.replace(/[\[\]|]/g, "").trim() || "Unknown";
}

function formatDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	const parts: string[] = [];
	if (h > 0) parts.push(`${h}h`);
	if (m > 0) parts.push(`${m}m`);
	if (s > 0 && h === 0) parts.push(`${s}s`);
	return parts.join(" ") || `${seconds}s`;
}
