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

	private async request<T>(method: string, path: string): Promise<T> {
		const url = `${this.baseUrl.replace(/\/+$/, "")}${path}`;
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
