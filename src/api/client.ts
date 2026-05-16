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

export interface ExportDTO {
	version: 1;
	tubezen_id: string;
	title: string;
	youtube_video_id: string;
	youtube_url: string;
	channel_title: string;
	channel_url: string;
	thumbnail_url: string;
	published_at: string;
	summarized_at: string;
	duration_seconds: number;
	tags: string[];
	summary_markdown: string;
	key_takeaways: unknown | null;
	tubezen_url: string | null;
}

export interface ListSavedParams {
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

	async listSaved(params: ListSavedParams = {}): Promise<ListSavedResponse> {
		const query: Record<string, string> = {};
		if (params.cursor) query.cursor = params.cursor;
		if (params.limit != null) query.limit = String(params.limit);
		return this.request<ListSavedResponse>(
			"GET",
			"/exports/saved",
			query,
		);
	}

	async getExport(idOrTubezenId: string): Promise<ExportDTO> {
		const interactionId = idOrTubezenId.startsWith("tvi_")
			? idOrTubezenId.slice(4)
			: idOrTubezenId;
		const response = await this.request<{ data: ExportDTO }>(
			"GET",
			`/exports/${encodeURIComponent(interactionId)}`,
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
