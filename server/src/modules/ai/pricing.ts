import { AI_MODEL_ID } from './model.ts'

/**
 * THE PRICE LIST: one place, one model (PROMPT 29).
 *
 * Every cost the assistant shows or counts against a budget is `tokens × these prices`: an ESTIMATE, never a bill. The numbers are
 * what Anthropic published for Claude Haiku 5.5 on `PRICES_AS_OF`, read from the pricing page named in `PRICING_SOURCE`. They are code,
 * reviewed like any other change, because they decide how fast a budget is used up: an administrator cannot edit them (a price of 0 in
 * the administration would switch the budget off). The operator can override the two main prices in the environment
 * (`AI_PRICE_INPUT_PER_MTOK`, `AI_PRICE_OUTPUT_PER_MTOK`, `AI_PRICES_AS_OF`) when the provider changes them before a developer has.
 *
 * Long prompts: the provider charges a higher rate when a PROMPT is over 100 000 tokens. Everything in this assistant is far below that
 * (a message is at most a few thousand characters, the history is windowed, a tool result is capped), but the cost function does not rely on
 * it: once the input of a request is over the threshold the whole request is priced at the long-prompt rate, which can only over-estimate.
 *
 * Prompt caching is not used by this assistant, so cached tokens are not priced separately. If the provider ever reports cache tokens they are
 * counted as ordinary input here (cache reads would be cheaper, cache writes dearer by a quarter; neither occurs).
 */

export const PRICING_SOURCE = 'https://platform.claude.com/docs/en/about-claude/pricing'
export const PRICES_AS_OF = '2026-11-17'

export const AI_PRICING = {
  model: AI_MODEL_ID,
  currency: 'USD',
  /** USD per million tokens, for prompts up to `longPromptThresholdTokens`. */
  inputPerMTok: 0.1,
  outputPerMTok: 0.5,
  /** The provider's rate for prompts over the threshold. */
  longPromptThresholdTokens: 100_000,
  longInputPerMTok: 0.5,
  longOutputPerMTok: 2.5,
} as const

export interface Prices {
  priceInputPerMTok: number
  priceOutputPerMTok: number
}

/** The estimated cost of this many tokens at the configured prices (long prompts at the long-prompt rate, never below the configured price). */
export function estimateCostUsd(inputTokens: number, outputTokens: number, prices: Prices): number {
  const long = inputTokens > AI_PRICING.longPromptThresholdTokens
  const input = long ? Math.max(prices.priceInputPerMTok, AI_PRICING.longInputPerMTok) : prices.priceInputPerMTok
  const output = long ? Math.max(prices.priceOutputPerMTok, AI_PRICING.longOutputPerMTok) : prices.priceOutputPerMTok
  return (inputTokens * input + outputTokens * output) / 1_000_000
}
