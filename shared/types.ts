export type AppConfig = {
	serverName: string;
	version: string;
	httpPort: number;
	features: {
		enableHttpAdmin: boolean;
		enableCodeEditing: boolean;
	};
};

export type SimpleSchemaType = "string" | "number" | "json";

export type ApiToolMeta = {
	name: string;
	title?: string;
	description?: string;
	inputSchema?: Record<string, SimpleSchemaType> | null;
};

export type ApiToolsList = { tools: ApiToolMeta[] };

export type ApiToolCallRequest = { name: string; args?: Record<string, unknown> };
export type ApiToolCallResponse = { ok: true; result: string } | { ok: false; error: string };

export type LogRecord = {
	ts: number;
	level: "debug" | "info" | "warn" | "error";
	source: string;
	message: string;
	data?: Record<string, unknown>;
};

export type LogsSnapshot = { items: LogRecord[] }; 