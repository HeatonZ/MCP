export type LogRecord = {
	ts: number;
	level: "debug" | "info" | "warn" | "error";
	source: string;
	message: string;
	data?: Record<string, unknown>;
};

export type LogsSnapshot = { items: LogRecord[] }; 