export type MiddlewareContext = {
	req: Request;
	url: URL;
	origin: string | null;
};

export type MiddlewareNext = () => Promise<Response>;

export type Middleware = (ctx: MiddlewareContext, next: MiddlewareNext) => Promise<Response>;

export class MiddlewareChain {
	private readonly arr: Middleware[] = [];

	use(mw: Middleware) { this.arr.push(mw); }

	compose(finalHandler: (ctx: MiddlewareContext) => Promise<Response>) {
		return async (ctx: MiddlewareContext): Promise<Response> => {
			let idx = -1;
			const dispatch = async (i: number): Promise<Response> => {
				if (i <= idx) throw new Error("next() called multiple times");
				idx = i;
				const fn = this.arr[i] ?? null;
				if (!fn) return finalHandler(ctx);
				return await fn(ctx, () => dispatch(i + 1));
			};
			return await dispatch(0);
		};
	}
}


