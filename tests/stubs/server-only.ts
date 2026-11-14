/**
 * Test stub for the `server-only` package.
 *
 * That package deliberately throws when a bundler resolves it for the browser.
 * Vitest runs in Node, where the guard has nothing to protect, so it resolves
 * here instead. See vitest.config.ts.
 */
export {};
