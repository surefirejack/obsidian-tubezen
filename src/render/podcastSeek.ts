import type { App, MarkdownPostProcessor } from "obsidian";

const TIMESTAMP_HREF = /^#t=(\d+(?:\.\d+)?)$/;

const CONTAINER_SELECTOR =
	".markdown-preview-view, .markdown-reading-view, .markdown-rendered, .view-content";

export function buildPodcastSeekProcessor(app: App): MarkdownPostProcessor {
	return (el, ctx) => {
		const frontmatter = app.metadataCache.getCache(ctx.sourcePath)
			?.frontmatter;
		if (frontmatter?.content_type !== "podcast") return;

		const anchors = el.querySelectorAll<HTMLAnchorElement>("a");
		anchors.forEach((link) => {
			const target =
				link.getAttribute("href") ?? link.getAttribute("data-href") ?? "";
			const match = target.match(TIMESTAMP_HREF);
			if (!match) return;
			const seconds = parseFloat(match[1]);
			if (!Number.isFinite(seconds)) return;

			const span = createSpan({
				cls: "tubezen-seek-link",
				text: link.textContent ?? "",
			});
			link.replaceWith(span);

			span.addEventListener("click", (ev) => {
				const audio = span
					.closest(CONTAINER_SELECTOR)
					?.querySelector<HTMLAudioElement>("audio");
				if (!audio) return;
				ev.preventDefault();
				ev.stopPropagation();
				audio.currentTime = seconds;
				void audio.play().catch(() => {
					/* autoplay may be blocked — the seek itself still applies */
				});
			});
		});
	};
}
