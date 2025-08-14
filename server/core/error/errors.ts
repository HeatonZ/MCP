export class AppError extends Error {
	readonly code: string;
	readonly status?: number;
	readonly details?: unknown;

	constructor(code: string, message: string, options?: { status?: number; details?: unknown }) {
		super(message);
		this.code = code;
		this.status = options?.status;
		this.details = options?.details;
	}
}

export function toErrorResponse(e: unknown): { ok: false; error: string; code?: string } {
	if (e instanceof AppError) return { ok: false as const, error: e.message, code: e.code };
	return { ok: false as const, error: String(e) };
}


