// The AI check, with a stand-in for Claude: these tests never call the real API.
import assert from "node:assert/strict";
import test from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import type { INewsArticle } from "../models/NewsArticle.js";
import { AI_MODEL, AI_VERSION, AiCheck, describeArticle, readAnswer, type MessagesApi } from "./newsAi.js";

const article = (title: string, tickers: string[], description = ""): INewsArticle => ({
  _id: `news:${title}`,
  source: "news",
  title,
  url: "https://example.com/a",
  publisher: "Zacks Investment Research",
  description,
  published_utc: "2026-11-02T14:02:00Z",
  published_at: new Date("2026-11-02T14:02:00Z"),
  tickers,
  first_seen_at: new Date("2026-11-02T14:05:00Z"),
});
const rules = (...tickers: string[]) => tickers.map((ticker) => ({ ticker, reason: "" }));

type Row = { ticker: string; why: string; about_company: boolean; category: string };
const reply = (rows: Row[], stop_reason: Anthropic.StopReason = "end_turn") => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: AI_MODEL,
  stop_reason,
  content: [{ type: "text", text: JSON.stringify({ tickers: rows }) }],
  usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 900 },
}) as unknown as Anthropic.Message;

/** A stand-in client that records each request and answers with `answer(request)`. */
function fakeClient(answer: (params: Anthropic.MessageCreateParamsNonStreaming) => Anthropic.Message | Error) {
  const requests: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client: MessagesApi = {
    messages: {
      create: async (params) => {
        requests.push(params);
        const result = answer(params);
        if (result instanceof Error) throw result;
        return result;
      },
    },
  };
  return { client, requests };
}

test("the AI's answer becomes a verdict per ticker, in the rules' terms", async () => {
  const { client, requests } = fakeClient(() => reply([
    { ticker: "NVDA", why: "Nvidia announced a supply deal with Oracle.", about_company: true, category: "Deal / contract / M&A" },
    { ticker: "CSCO", why: "Cisco is only named as a partner.", about_company: false, category: "Deal / contract / M&A" },
    { ticker: "MU", why: "Opinion on whether to buy the stock.", about_company: true, category: "opinion / listicle" },
  ]));
  const ai = new AiCheck(client);
  const verdicts = await ai.judge(article("NVIDIA and Oracle Expand Vera Rubin", ["NVDA", "CSCO", "MU"]), rules("NVDA", "CSCO", "MU"));

  assert.deepEqual(verdicts?.get("NVDA"), {
    verdict: "show", event: "Deal / contract / M&A", reason: "", note: "Nvidia announced a supply deal with Oracle.",
  });
  // An event type without test 1 is still a drop: the article is about someone else.
  assert.equal(verdicts?.get("CSCO")?.verdict, "drop");
  assert.equal(verdicts?.get("CSCO")?.reason, "only mentions the company");
  assert.equal(verdicts?.get("MU")?.reason, "opinion / listicle");

  assert.equal(requests.length, 1);
  const [request] = requests;
  assert.equal(request.model, "claude-haiku-5-5");
  assert.deepEqual((request.system as Anthropic.TextBlockParam[])[0].cache_control, { type: "ephemeral" });
  assert.equal(request.output_config?.format?.type, "json_schema");
  const message = String(request.messages[0].content);
  assert.match(message, /Headline: NVIDIA and Oracle Expand Vera Rubin/);
  assert.match(message, /- NVDA \(Nvidia\)/);
  assert.match(message, /- CSCO \(Cisco\)/);

  assert.equal(ai.stats.calls, 1);
  assert.equal(ai.stats.cache_read_tokens, 900);
  assert.ok(ai.stats.cost_usd > 0);
  assert.equal(ai.version, AI_VERSION);
});

test("ads and big roundups aren't sent, and the call limit holds", async () => {
  const { client, requests } = fakeClient(() => reply([
    { ticker: "NVDA", why: "Earnings beat.", about_company: true, category: "Earnings / guidance" },
  ]));
  const ai = new AiCheck(client, 1);

  const ad = await ai.judge(article("Class action filed against Nvidia", ["NVDA"]), [{ ticker: "NVDA", reason: "law-firm ad" }]);
  const many = Array.from({ length: 13 }, (_, i) => `T${i}`);
  const roundup = await ai.judge(article("Tech stocks today", many), rules(...many));
  const first = await ai.judge(article("Nvidia Q3 Earnings Beat", ["NVDA"]), rules("NVDA"));
  const second = await ai.judge(article("Nvidia Q4 Earnings Beat", ["NVDA"]), rules("NVDA"));

  assert.equal(ad, null);
  assert.equal(roundup, null);
  assert.equal(first?.get("NVDA")?.verdict, "show");
  assert.equal(second, null); // over the limit of 1 call
  assert.equal(requests.length, 1);
  assert.deepEqual(
    [ai.stats.skipped_ads, ai.stats.skipped_roundups, ai.stats.skipped_budget, ai.stats.calls],
    [1, 1, 1, 1],
  );
});

test("a failed or unusable answer keeps the rules' verdicts, and a bad key stops the check", async () => {
  // Cut off before it finished, or refused: no verdicts.
  let { client } = fakeClient(() => reply([], "max_tokens"));
  let ai = new AiCheck(client);
  assert.equal(await ai.judge(article("Nvidia news", ["NVDA"]), rules("NVDA")), null);
  assert.equal(ai.stats.failed, 1);

  // A bad key: the first call fails and no more are sent this run.
  const badKey = new Anthropic.AuthenticationError(401, { type: "error" }, "invalid x-api-key", new Headers());
  const fake = fakeClient(() => badKey);
  ai = new AiCheck(fake.client);
  assert.equal(await ai.judge(article("Nvidia news", ["NVDA"]), rules("NVDA")), null);
  assert.equal(await ai.judge(article("AMD news", ["AMD"]), rules("AMD")), null);
  assert.equal(fake.requests.length, 1);
  assert.equal(ai.stats.skipped_budget, 1);
  assert.match(ai.stats.error, /^401/);
});

test("readAnswer ignores tickers it wasn't asked about and categories it doesn't know", () => {
  const verdicts = readAnswer(JSON.stringify({
    tickers: [
      { ticker: "nvda", why: "Earnings.", about_company: true, category: "Earnings / guidance" },
      { ticker: "ORCL", why: "Not ours.", about_company: true, category: "Earnings / guidance" },
      { ticker: "AMD", why: "?", about_company: true, category: "something else" },
    ],
  }), ["NVDA", "AMD"]);
  assert.deepEqual([...verdicts.keys()], ["NVDA"]);
});

test("the message names each company, so common-word tickers can be checked by name", () => {
  const text = describeArticle(article("Cloudflare Q3 Earnings Beat", ["NET", "GOOGL"], "Revenue rose 28%."), ["NET"]);
  assert.match(text, /- NET \(Cloudflare\)/);
  assert.match(text, /Feed summary: Revenue rose 28%\./);
  assert.match(text, /tagged this article with 2 tickers/);
});
