import type { App, MarkdownPostProcessor } from "obsidian";

const YT_TIMESTAMP =
	/(?:youtu\.be\/[\w-]+|youtube\.com\/watch[^"'\s]*v=[\w-]+)[?&]t=(\d+)s?/;

const CONTAINER_SELECTOR =
	".markdown-preview-view, .markdown-reading-view, .markdown-rendered, .view-content";

const YT_IFRAME_SELECTOR = [
	'iframe[src*="youtube.com"]',
	'iframe[src*="youtube-nocookie.com"]',
	'iframe[src*="youtu.be"]',
	'iframe[src*="releases.obsidian.md/youtube"]',
].join(", ");

export function buildVideoSeekProcessor(_app: App): MarkdownPostProcessor {
	return (el, _ctx) => {
		const anchors = el.querySelectorAll<HTMLAnchorElement>("a");
		anchors.forEach((link) => {
			const href =
				link.getAttribute("href") ?? link.getAttribute("data-href") ?? "";
			const match = href.match(YT_TIMESTAMP);
			if (!match) return;
			const seconds = parseInt(match[1], 10);
			if (!Number.isFinite(seconds)) return;

			const span = link.doc.createEl("span", {
				cls: "tubezen-seek-link",
				text: link.textContent ?? "",
			});
			link.replaceWith(span);

			span.addEventListener("click", (ev) => {
				ev.preventDefault();
				ev.stopPropagation();
				const container = span.closest(CONTAINER_SELECTOR);
				const iframe =
					container?.querySelector<HTMLIFrameElement>(YT_IFRAME_SELECTOR) ??
					container?.querySelector<HTMLIFrameElement>("iframe") ??
					null;
				if (iframe) {
					seekYouTube(iframe, seconds);
				} else {
					window.open(href, "_blank");
				}
			});
		});
	};
}

function seekYouTube(iframe: HTMLIFrameElement, seconds: number): void {
	try {
		const url = new URL(iframe.src);
		url.searchParams.set("start", String(seconds));
		url.searchParams.set("autoplay", "1");
		iframe.src = url.toString();
	} catch {
		// If the src isn't a parseable URL for some reason, leave the iframe alone
		// and the default link-click behavior will still navigate to YouTube.
	}
}
