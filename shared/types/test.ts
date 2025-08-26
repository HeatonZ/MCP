export type TestResult = {
  success: boolean;
  message: string;
  data?: unknown;
  duration?: number;
};

export type UpstreamTestRequest = {
  upstreamName: string;
  testType: 'connection' | 'tools' | 'resources' | 'prompts';
};

export type ToolTestRequest = {
  toolName: string;
  args?: Record<string, unknown>;
};

export type ResourceTestRequest = {
  resourceUri: string;
};

export type PromptTestRequest = {
  promptName: string;
  args?: Record<string, unknown>;
};

export type TestSuite = {
  name: string;
  tests: TestCase[];
};

export type TestCase = {
  id: string;
  name: string;
  description?: string;
  request: UpstreamTestRequest | ToolTestRequest | ResourceTestRequest | PromptTestRequest;
  expectedResult?: unknown;
};
