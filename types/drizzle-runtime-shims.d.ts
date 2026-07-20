// Some Windows/OneDrive workspaces leave these dependency declarations as
// offline reparse points. The application only needs this small public surface.
/* eslint-disable @typescript-eslint/no-explicit-any */
declare module "drizzle-orm/d1" {
  export function drizzle<TSchema = Record<string, unknown>>(
    database: D1Database,
    options?: { schema?: TSchema },
  ): any;
}

declare module "drizzle-kit" {
  export function defineConfig<T>(config: T): T;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
