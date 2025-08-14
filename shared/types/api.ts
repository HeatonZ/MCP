import type { SimpleSchemaType } from "./tool.ts";

export type ApiToolMeta = {
	name: string;
	title?: string;
	description?: string;
	inputSchema?: Record<string, SimpleSchemaType> | null;
};

export type ApiToolsList = { tools: ApiToolMeta[] };

export type ApiToolCallRequest = { name: string; args?: Record<string, unknown> };
export type ApiToolCallResponse = { ok: true; result: string } | { ok: false; error: string }; 