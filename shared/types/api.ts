import type { ApiToolInputSchema } from "./types.ts";

export type ApiToolMeta = {
	name: string;
	title?: string;
	description?: string;
	inputSchema?: ApiToolInputSchema;
};

export type ApiToolsList = { tools: ApiToolMeta[] };

export type ApiToolCallRequest = { name: string; args?: Record<string, unknown> };
export type ApiToolCallResponse = { ok: true; result: string } | { ok: false; error: string }; 