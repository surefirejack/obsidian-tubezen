import { requestUrl, RequestUrlResponse } from "obsidian";

export interface MeResponse {
	user?: {
		id?: number | string;
		email?: string;
		name?: string;
	};
	tenant?: {
		id?: number | string;
		name?: string;
	};
	subscription?: {
		status?: string;
		plan_slug?: string;
		product_slug?: string;
		ends_at?: string | null;
	};
	features?: Record<string, boolean>;
}

interface BaseExportDTO {
	version: 1;
	tubezen_id: string;
	title: string;
	channel_title: string;
	channel_url: string;
	thumbnail_url: string;
	published_at: string;
	summarized_at: string;
	duration_seconds: number;
	saved_tag: string | null;
	tags: string[];
	summary_markdown: string;
	key_takeaways: unknown | null;
	tubezen_url: string | null;
}

export interface YouTubeExportDTO extends BaseExportDTO {
	content_type: "youtube";
	youtube_video_id: string;
	youtube_url: string;
	taddy_uuid: null;
	audio_url: null;
	season_number: null;
	episode_number: null;
}

export interface PodcastExportDTO extends BaseExportDTO {
	content_type: "podcast";
	youtube_video_id: null;
	youtube_url: null;
	taddy_uuid: string | null;
	audio_url: string | null;
	season_number: number | null;
	episode_number: number | null;
}

export type ExportDTO = YouTubeExportDTO | PodcastExportDTO;

export type SyncType = "video" | "podcast";

export interface ListSavedParams {
	type: SyncType;
	cursor?: string | null;
	limit?: number;
}

export interface ListSavedResponse {
	version: 1;
	data: ExportDTO[];
	links?: {
		first?: string | null;
		last?: string | null;
		prev?: string | null;
		next?: string | null;
	};
	meta?: {
		next_cursor?: string | null;
		prev_cursor?: string | null;
		[key: string]: unknown;
	};
}

export type ApiErrorCode =
	| "network"
	| "unauthenticated"
	| "forbidden"
	| "feature_inactive"
	| "not_found"
	| "not_exportable"
	| "invalid_type"
	| "http_error";

export class TubeZenApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly code: ApiErrorCode,
		message: string,
		public readonly body?: unknown,
	) {
		super(message);
		this.name = "TubeZenApiError";
	}
}

export class TubeZenClient {
	constructor(
		private readonly baseUrl: string,
		private readonly token: string,
	) {}

	async me(): Promise<MeResponse> {
		return this.request<MeResponse>("GET", "/me");
	}

	async listSaved(params: ListSavedParams): Promise<ListSavedResponse> {
		const query: Record<string, string> = { type: params.type };
		if (params.cursor) query.cursor = params.cursor;
		if (params.limit != null) query.limit = String(params.limit);
		return this.request<ListSavedResponse>(
			"GET",
			"/exports/saved",
			query,
		);
	}

	async getExport(tubezenId: string): Promise<ExportDTO> {
		const response = await this.request<{ data: ExportDTO }>(
			"GET",
			`/exports/${encodeURIComponent(tubezenId)}`,
		);
		return response.data;
	}

	private async request<T>(
		method: string,
		path: string,
		query?: Record<string, string>,
	): Promise<T> {
		const search =
			query && Object.keys(query).length
				? "?" + new URLSearchParams(query).toString()
				: "";
		const url = `${this.baseUrl.replace(/\/+$/, "")}${path}${search}`;
		let response: RequestUrlResponse;
		try {
			response = await requestUrl({
				url,
				method,
				headers: {
					Authorization: `Bearer ${this.token}`,
					Accept: "application/json",
				},
				throw: false,
			});
		} catch (err) {
			throw new TubeZenApiError(
				0,
				"network",
				(err as Error).message ?? "Network error",
			);
		}

		const body = safeJson(response);

		if (response.status >= 200 && response.status < 300) {
			return body as T;
		}

		switch (response.status) {
			case 400: {
				const errCode = (body as { error?: string } | undefined)?.error;
				if (errCode === "invalid_type") {
					throw new TubeZenApiError(
						400,
						"invalid_type",
						"Backend rejected the sync type parameter.",
						body,
					);
				}
				throw new TubeZenApiError(
					400,
					"http_error",
					"Bad request.",
					body,
				);
			}
			case 401:
				throw new TubeZenApiError(
					401,
					"unauthenticated",
					"Token is invalid or revoked.",
					body,
				);
			case 402:
				throw new TubeZenApiError(
					402,
					"feature_inactive",
					"Feature not enabled for this tenant.",
					body,
				);
			case 403:
				throw new TubeZenApiError(
					403,
					"forbidden",
					"Token is not associated with a tenant.",
					body,
				);
			case 404: {
				const code =
					(body as { error?: string } | undefined)?.error ?? "not_found";
				throw new TubeZenApiError(
					404,
					code === "not_exportable" ? "not_exportable" : "not_found",
					code === "not_exportable"
						? "Video is not exportable."
						: "Resource not found.",
					body,
				);
			}
			default:
				throw new TubeZenApiError(
					response.status,
					"http_error",
					`Request failed with status ${response.status}.`,
					body,
				);
		}
	}
}

function safeJson(response: RequestUrlResponse): unknown {
	try {
		return response.json;
	} catch {
		return undefined;
	}
}

export function formatApiError(err: TubeZenApiError): string {
	switch (err.code) {
		case "unauthenticated":
			return "Token is invalid or revoked. Generate a new one in your TubeZen dashboard.";
		case "forbidden":
			return "Token is not associated with a tenant. Regenerate it from the API Tokens page.";
		case "feature_inactive": {
			const body = err.body as { upgrade_url?: string } | undefined;
			return body?.upgrade_url
				? `Pro feature not enabled. Upgrade: ${body.upgrade_url}`
				: "Pro feature not enabled on this account.";
		}
		case "not_found":
			return "This item isn't available — it may have been removed from your TubeZen account.";
		case "not_exportable":
			return "This item is not in an exportable state.";
		case "invalid_type":
			return "Backend rejected the sync type parameter. Please file an issue.";
		case "network":
			return `Network error: ${err.message}`;
		default:
			return `Error ${err.status}: ${err.message}`;
	}
}
