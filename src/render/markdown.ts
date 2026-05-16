import type { ExportDTO, PodcastExportDTO } from "../api/client";
import type { TubeZenSettings } from "../settings";

export function renderNote(
	dto: ExportDTO,
	settings: TubeZenSettings,
): string {
	const sections: string[] = [
		buildFrontmatter(dto, settings),
		buildCallout(dto),
		buildSummary(dto),
	];
	if (settings.attribution) sections.push(buildFooter());
	return sections.join("\n\n") + "\n";
}

function buildFrontmatter(
	dto: ExportDTO,
	settings: TubeZenSettings,
): string {
	const tags = (dto.tags ?? []).map((t) =>
		prefixTag(t, settings.tagPrefix),
	);
	const lines: string[] = ["---"];
	lines.push(yamlScalar("tubezen_id", dto.tubezen_id));
	lines.push(yamlScalar("content_type", dto.content_type));
	lines.push(yamlScalar("title", dto.title));
	lines.push(yamlScalar("youtube_video_id", dto.youtube_video_id));
	lines.push(yamlScalar("youtube_url", dto.youtube_url));
	lines.push(yamlScalar("taddy_uuid", dto.taddy_uuid));
	lines.push(yamlScalar("audio_url", dto.audio_url));
	lines.push(yamlNumberOrNull("season_number", dto.season_number));
	lines.push(yamlNumberOrNull("episode_number", dto.episode_number));
	lines.push(yamlScalar("channel_title", dto.channel_title));
	lines.push(yamlScalar("channel_url", dto.channel_url));
	lines.push(yamlScalar("thumbnail_url", dto.thumbnail_url));
	lines.push(yamlScalar("published_at", dto.published_at));
	lines.push(yamlScalar("summarized_at", dto.summarized_at));
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

function formatSeasonEpisode(dto: PodcastExportDTO): string | null {
	const parts: string[] = [];
	if (dto.season_number != null) parts.push(`Season ${dto.season_number}`);
	if (dto.episode_number != null) parts.push(`Episode ${dto.episode_number}`);
	return parts.length ? parts.join(" · ") : null;
}

function buildSummary(dto: ExportDTO): string {
	return `## Summary\n\n${dto.summary_markdown ?? ""}`;
}

function buildFooter(): string {
	const today = new Date().toISOString().slice(0, 10);
	return `---\n\n*Imported from [TubeZen](https://tubezen.ai) on ${today}.*`;
}

function prefixTag(tag: string, prefix: string): string {
	if (!prefix || tag.startsWith(prefix)) return tag;
	return `${prefix}${tag}`;
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
