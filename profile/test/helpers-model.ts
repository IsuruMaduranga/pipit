/**
 * A model as pi's registry holds it, for tests that read a model's id, price
 * or thinking levels. `levels` is pi's `thinkingLevelMap`: a level mapped to
 * `null` is one the model does not reach.
 */
import type { Api, Model } from "@earendil-works/pi-ai";

export interface FixtureModelOptions {
	/** USD per million tokens, input and output. */
	price?: readonly [number, number];
	baseUrl?: string;
	levels?: Readonly<Record<string, string | null>>;
}

export function fixtureModel(provider: string, id: string, { price = [0, 0], baseUrl = "https://openrouter.ai/api/v1", levels = {} }: FixtureModelOptions = {}): Model<Api> {
	return {
		provider, id, name: id, api: "openai-completions", baseUrl, reasoning: true, input: ["text"],
		cost: { input: price[0], output: price[1], cacheRead: 0, cacheWrite: 0 }, contextWindow: 200_000, maxTokens: 32_000, thinkingLevelMap: levels,
	} as unknown as Model<Api>;
}
