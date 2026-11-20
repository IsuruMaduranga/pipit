/**
 * The product's own test setup, after the base's (`vitest.config.ts` loads
 * it when it exists).
 *
 * No product test reaches the internet. A session start now asks Ballerina
 * Central for the newest versions (`profile/extensions/ballerina/updates.ts`),
 * and every test that loads the extension on a machine with Ballerina would
 * otherwise do so. Requests to this machine (the diagram view's server) pass;
 * a test that needs an answer from elsewhere stubs `fetch` itself.
 */
const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
	const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
	if (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]") return realFetch(input, init);
	throw new Error(`No network in the product's tests: ${url.origin}`);
}) as typeof fetch;
