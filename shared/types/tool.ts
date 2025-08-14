export type SimpleSchemaType = "string" | "number" | "json";

export type ToolSpec = {
	name: string;
	title: string;
	description: string;
	inputSchema?: Record<string, SimpleSchemaType>;
	zodSchema?: any;
	handler: (args: Record<string, unknown>) => Promise<{ text: string; isError?: boolean }>;
}; 