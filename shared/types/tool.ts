export type SimpleSchemaType = "string" | "number" | "json" | "boolean";

export type ToolInputProperties = Record<string, SimpleSchemaType>;

export type ToolInputSchemaSource = "upstream" | "manual";

export type ToolInputSchema = {
	properties: ToolInputProperties;
	required?: string[];
	source?: ToolInputSchemaSource;
};

export type ToolSpec = {
	name: string;
	title: string;
	description: string;
	inputSchema?: ToolInputSchema;
	zodSchema?: any;
	handler: (args: Record<string, unknown>) => Promise<{ text: string; isError?: boolean }>;
};