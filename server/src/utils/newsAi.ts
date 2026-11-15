// The AI check: a small Claude model reads each new Massive article and decides, for each of our
// tickers it is tagged with, whether it is material news about that company. It applies the same
// three tests as the rules (newsRules.ts) and answers with the same event types and drop reasons,
// so the rest of the code doesn't care who made the call. The rules still run first, and their
// verdict is saved next to the AI's so the two can be compared.
//
// Used by the news job (src/jobs/ingestNews.ts) when ANTHROPIC_API_KEY is set, and by
// src/jobs/scoreAiCheck.ts to measure it against hand-labelled stories.
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import type { INewsArticle } from "../models/NewsArticle.js";
import type { Judgement } from "../models/NewsVerdict.js";
import { EVENTS, NAMES } from "./newsRules.js";

export const AI_MODEL = "claude-haiku-5-5";
const EFFORT = "low" as const; // a short judgment call per article; "low" keeps thinking brief
const MAX_TOKENS = 2048;

// Claude Haiku 5.5 prices in dollars per million tokens, for prompts under 100K tokens (Nov 2026).
// Only used to report what a run cost; the spend limit on the Anthropic workspace is the real cap.
const PRICE = { input: 0.1, cacheWrite: 0.125, cacheRead: 0.01, output: 0.5 };

export const EVENT_TYPES = EVENTS.map(([name]) => name);
const DROP_REASONS = [
  "opinion / listicle",
  "analyst rating",
  "market roundup",
  "only mentions the company",
  "event notice / preview",
  "price move, no cause named",
  "holdings / insider trade",
  "law-firm ad",
  "market-research ad",
  "no material event",
];
const CATEGORIES = [...EVENT_TYPES, ...DROP_REASONS];

// Articles the rules flagged as ads are certain junk, so they aren't sent to the AI.
const SKIP_REASONS = new Set(["law-firm ad", "market-research ad"]);
// An article tagged with more of our tickers than this is a roundup; keep the rules' verdicts.
const MAX_TICKERS = 12;
const DESCRIPTION_CHARS = 800;
// Calls in a row that fail before the check gives up for the rest of the run.
const MAX_FAILURES_IN_A_ROW = 5;

export const SYSTEM_PROMPT = `You check news for an investment research site that tracks about 200 public companies, mostly in AI infrastructure and software. Each company's row on the site shows its latest material news. For each ticker listed with an article, you decide whether the article is material news about that company.

An article is shown for a ticker only if it passes all three tests.
1. About this company. The company is a main subject of the article. It is not one of many names in a roundup, a passing mention, or a partner named in another company's press release. Confirm the company by name. Some tickers are ordinary words (AI, ON, NOW, NET, PATH, TEAM, S), so never decide from the ticker alone.
2. Something happened. A new fact the company did, said or filed, or that was done to it. Not a view on the stock, a prediction, a recap of old news, or a preview of an event that hasn't happened yet.
3. Material. The fact is one of these event types.
- Earnings / guidance: results, guidance raises or cuts, pre-announcements, earnings-call highlights.
- Deal / contract / M&A: acquisitions, mergers, divestitures, spin-offs, and major customer, supply, partnership or capacity deals.
- Capital / buyback / dividend: share offerings, convertible notes, buybacks, dividend changes.
- Product / capacity: new products and chips, fabs, data centers, power or capacity coming online.
- Leadership: CEO, CFO or board changes.
- Legal / regulatory: export controls, antitrust, regulator investigations, major lawsuits or rulings, and government action aimed at the company.

Choose the category that fits best. Use an event type only when all three tests pass. Otherwise use the reason it fails.
- opinion / listicle: "is it a buy", predictions, "3 reasons to...", stocks to watch, long-term takes, two stocks compared.
- analyst rating: upgrades, downgrades, price targets, Zacks Rank, ratings recaps.
- market roundup: the company is one of several names in a market or sector wrap-up.
- only mentions the company: the article is about someone else (a customer, partner or rival) and names this company in passing.
- event notice / preview: conference appearances, scheduled earnings dates, "what to expect" previews, webcast notices.
- price move, no cause named: the stock moved and the article names no company event as the cause.
- holdings / insider trade: a fund or an insider bought or sold shares.
- law-firm ad, market-research ad: promotional releases.
- no material event: about the company, but nothing material happened (minor awards, routine updates, generic commentary).

Edge cases.
- An explainer of why the stock moved counts only if it names the company event that caused it. Then use that event's type.
- A results write-up from a research outlet (for example "X Q3 earnings beat estimates") is earnings news, even though the same outlet also rates stocks.
- Headline words can mislead. "Time to buy" is opinion, not an acquisition. A list of dividend stocks is a listicle, not a capital event.
- Judge each ticker on its own. One article can be real news for one company and a passing mention of another.

Answer for every ticker listed. For each one, first write "why" as one short sentence (under 20 words), then set about_company (test 1) and category.`;

export const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    tickers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "The ticker exactly as listed" },
          why: { type: "string", description: "One short sentence, under 20 words" },
          about_company: { type: "boolean", description: "Test 1: the company is a main subject of the article" },
          category: { type: "string", enum: CATEGORIES },
        },
        required: ["ticker", "why", "about_company", "category"],
        additionalProperties: false,
      },
    },
  },
  required: ["tickers"],
  additionalProperties: false,
};

/** Changes whenever the model, prompt or answer format changes. Saved with every AI verdict, so
 *  verdicts from different versions of the check can be told apart. */
export const AI_VERSION = createHash("sha256")
  .update(JSON.stringify({ model: AI_MODEL, effort: EFFORT, system: SYSTEM_PROMPT, schema: ANSWER_SCHEMA }))
  .digest("hex")
  .slice(0, 12);

export type AiJudgement = Judgement & { note: string };

export type AiStats = {
  enabled: boolean;
  model: string;
  version: string;
  calls: number; // requests sent
  failed: number; // requests that errored or gave no usable answer (the rules' verdicts were kept)
  skipped_ads: number; // articles the rules flagged as ads, not sent
  skipped_roundups: number; // articles tagged with more than MAX_TICKERS of our tickers, not sent
  skipped_budget: number; // articles over the run's call limit, not sent
  input_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  output_tokens: number;
  cost_usd: number;
  error: string; // the last error, if any
};

/** All-zero totals; enabled is false for a run without ANTHROPIC_API_KEY. */
export const aiStats = (enabled: boolean): AiStats => ({
  enabled, model: AI_MODEL, version: AI_VERSION, calls: 0, failed: 0, skipped_ads: 0, skipped_roundups: 0,
  skipped_budget: 0, input_tokens: 0, cache_write_tokens: 0, cache_read_tokens: 0, output_tokens: 0, cost_usd: 0,
  error: "",
});

// The one SDK call the check makes. The tests pass a stand-in.
export type MessagesApi = {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming): PromiseLike<Anthropic.Message> };
};

const companyNames = (ticker: string) => (NAMES[ticker] ?? []).map((name) => name.replace(/^=+/, "")).join(" / ");

/** The user message for one article: what the AI sees. */
export function describeArticle(article: INewsArticle, tickers: string[]) {
  const description = (article.description ?? "").trim();
  return [
    `Headline: ${article.title}`,
    `Publisher: ${article.publisher || "unknown"}`,
    `Published: ${article.published_utc}`,
    `Feed summary: ${description ? description.slice(0, DESCRIPTION_CHARS) : "(none)"}`,
    `The feed tagged this article with ${article.tickers.length} ticker${article.tickers.length === 1 ? "" : "s"} in total.`,
    "Tickers to judge:",
    ...tickers.map((ticker) => `- ${ticker} (${companyNames(ticker)})`),
  ].join("\n");
}

/** Turns the AI's answer into a verdict per ticker. Tickers it wasn't asked about are ignored. */
export function readAnswer(text: string, asked: string[]): Map<string, AiJudgement> {
  const parsed = JSON.parse(text) as { tickers?: unknown };
  if (!Array.isArray(parsed.tickers)) throw new Error("answer has no tickers list");
  const verdicts = new Map<string, AiJudgement>();
  for (const row of parsed.tickers as Record<string, unknown>[]) {
    const ticker = String(row?.ticker ?? "").trim().toUpperCase();
    const category = String(row?.category ?? "");
    if (!asked.includes(ticker) || verdicts.has(ticker) || !CATEGORIES.includes(category)) continue;
    const note = String(row.why ?? "").slice(0, 300);
    const isEvent = EVENT_TYPES.includes(category);
    verdicts.set(ticker, row.about_company === true && isEvent
      ? { verdict: "show", event: category, reason: "", note }
      : { verdict: "drop", event: "", reason: isEvent ? "only mentions the company" : category, note });
  }
  return verdicts;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300);

/** Why an article isn't sent to the AI ("ad" or "roundup"), or null if it is, from the rules' verdicts. */
export function notSent(rules: { reason: string }[]) {
  if (rules.every((r) => SKIP_REASONS.has(r.reason))) return "ad";
  if (rules.length > MAX_TICKERS) return "roundup";
  return null;
}

/** fn over every item, at most `limit` at a time, results in the same order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** One run's worth of AI checks: holds the client, the call limit and the running totals. */
export class AiCheck {
  readonly stats = aiStats(true);
  private failuresInARow = 0;
  private stopped = false;

  constructor(private readonly client: MessagesApi, private readonly maxCalls = Infinity) {}

  /** null when ANTHROPIC_API_KEY isn't set: the job then keeps the rules' verdicts, as before. */
  static fromEnv(maxCalls?: number) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    return new AiCheck(new Anthropic({ apiKey, maxRetries: 3, timeout: 60_000 }), maxCalls);
  }

  get version() {
    return AI_VERSION;
  }

  /** The AI's verdict for each of the article's tickers, or null to keep the rules' verdicts
   *  (an ad, a big roundup, over the call limit, or the call failed). Never throws. */
  async judge(article: INewsArticle, rules: { ticker: string; reason: string }[]): Promise<Map<string, AiJudgement> | null> {
    if (rules.length === 0) return null;
    const skip = notSent(rules);
    if (skip === "ad") this.stats.skipped_ads += 1;
    if (skip === "roundup") this.stats.skipped_roundups += 1;
    if (skip) return null;
    if (this.stopped || this.stats.calls >= this.maxCalls) {
      this.stats.skipped_budget += 1;
      return null;
    }
    this.stats.calls += 1; // counted before the await, so calls running side by side respect the limit

    const tickers = rules.map((r) => r.ticker);
    try {
      const response = await this.client.messages.create({
        model: AI_MODEL,
        max_tokens: MAX_TOKENS,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: describeArticle(article, tickers) }],
        output_config: { effort: EFFORT, format: { type: "json_schema", schema: ANSWER_SCHEMA } },
      });
      this.addUsage(response.usage);
      if (response.stop_reason !== "end_turn") throw new Error(`no usable answer (stopped: ${response.stop_reason})`);
      const text = response.content.find((block) => block.type === "text");
      if (!text || text.type !== "text") throw new Error("answer has no text");
      const verdicts = readAnswer(text.text, tickers);
      this.failuresInARow = 0;
      return verdicts;
    } catch (error) {
      this.stats.failed += 1;
      this.stats.error = errorText(error);
      this.failuresInARow += 1;
      // A bad key, a missing permission, a rejected request or a spent budget won't fix itself mid-run.
      const fatal = error instanceof Anthropic.AuthenticationError
        || error instanceof Anthropic.PermissionDeniedError
        || error instanceof Anthropic.BadRequestError;
      if (fatal || this.failuresInARow >= MAX_FAILURES_IN_A_ROW) this.stopped = true;
      return null;
    }
  }

  private addUsage(usage: Anthropic.Usage | undefined) {
    if (!usage) return;
    const input = usage.input_tokens ?? 0;
    const write = usage.cache_creation_input_tokens ?? 0;
    const read = usage.cache_read_input_tokens ?? 0;
    const output = usage.output_tokens ?? 0;
    this.stats.input_tokens += input;
    this.stats.cache_write_tokens += write;
    this.stats.cache_read_tokens += read;
    this.stats.output_tokens += output;
    const cost = (input * PRICE.input + write * PRICE.cacheWrite + read * PRICE.cacheRead + output * PRICE.output) / 1e6;
    this.stats.cost_usd = Math.round((this.stats.cost_usd + cost) * 1e6) / 1e6;
  }
}
