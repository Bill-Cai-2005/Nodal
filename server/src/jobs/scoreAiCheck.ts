// Measures the AI check (utils/newsAi.ts) against the hand-labelled stories made by the labelling
// tool (tools/labelling/build_label_set.py, on the news-labelling branch). It runs the AI on the
// Goalset 1 stories that were labelled (each ticker's pick and a sample of what the rules dropped),
// exactly as the news job would, and compares the AI and the rules with the labels.
//
// From server/:
//   npm run score-ai -- --labelling <path to tools/labelling> [--labels labels.json] [--env-file .env]
//
//   --labelling  the labelling tool's folder. Reads out/items.json and data/news.json, and writes
//                out/ai-verdicts.json and out/ai-score.md (that folder is gitignored).
//   --labels     the saved labels, the same file `build_label_set.py score` reads. Without it the
//                report only compares the AI with the rules.
//   --env-file   a .env file to read ANTHROPIC_API_KEY from. Nothing else in it is read.
//   --dry-run    make no AI calls; stories without a saved AI answer count as the rules' verdict.
//
// The AI's answers are saved in out/ai-verdicts.json and reused while the AI check's version is
// unchanged, so re-scoring after more labelling makes no new calls. It never touches a database.
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { AI_MODEL, AI_VERSION, AiCheck, mapLimit, notSent, type AiJudgement, type AiStats } from "../utils/newsAi.js";
import { judgeByRules, type MassiveArticle } from "../utils/newsStore.js";

type Item = {
  id: string; set: string; ticker: string; title: string; url: string; publisher: string; event: string; why: string;
};
type Label = { id: string; verdict?: string; reason?: string; note?: string };
type Cache = { version: string; model: string; answers: Record<string, Record<string, AiJudgement> | null>; stats: AiStats[] };

const { values: args } = parseArgs({
  options: {
    labelling: { type: "string" }, labels: { type: "string" }, "env-file": { type: "string" }, "dry-run": { type: "boolean" },
  },
});
if (!args.labelling) {
  console.error("Usage: npm run score-ai -- --labelling <path to tools/labelling> [--labels labels.json] [--env-file .env]");
  process.exit(2);
}
const dir = path.resolve(args.labelling);
const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;
const pct = (k: number, n: number) => (n ? `${Math.round((100 * k) / n)}%` : "n/a");

/** 95% range for a rate measured on n items (same as build_label_set.py). */
function wilson(k: number, n: number, z = 1.96) {
  if (!n) return [0, 0];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}
const rate = (k: number, n: number) => {
  const [low, high] = wilson(k, n);
  return `${k} of ${n} (${pct(k, n)}; likely ${Math.round(100 * low)}%–${Math.round(100 * high)}%)`;
};

// -----------------------------------------------------------------------------------------------------
// The labelled stories, and the articles behind them
// -----------------------------------------------------------------------------------------------------
const data = readJson<{ meta: { window: { since: string; until: string } }; items: Item[] }>(path.join(dir, "out", "items.json"));
const items = data.items.filter((item) => item.set === "g1_pick" || item.set === "g1_drop");
const news = readJson<MassiveArticle[]>(path.join(dir, "data", "news.json"));
const since = new Date(data.meta.window.since);
const until = new Date(data.meta.window.until);

const byUrl = new Map<string, MassiveArticle>();
for (const article of news) if (article.article_url && !byUrl.has(article.article_url)) byUrl.set(article.article_url, article);

type Row = Item & { articleId: string; rules: { verdict: string; event: string; reason: string } };
const rows: Row[] = [];
const toJudge = new Map<string, NonNullable<ReturnType<typeof judgeByRules>>>();
let rulesDrift = 0;
for (const item of items) {
  const judged = byUrl.has(item.url) ? judgeByRules(byUrl.get(item.url)!, until) : null;
  const rules = judged?.verdicts.find((v) => v.ticker === item.ticker);
  if (!judged || !rules) throw new Error(`no article or verdict for ${item.id} (${item.ticker}, ${item.url})`);
  // The labels were made with news_spike.py's rules; the job uses their TypeScript port.
  if (rules.verdict !== (item.set === "g1_pick" ? "show" : "drop")) rulesDrift += 1;
  rows.push({ ...item, articleId: judged.article._id, rules });
  toJudge.set(judged.article._id, judged);
}

// -----------------------------------------------------------------------------------------------------
// The AI's answers: from the cache when this version already answered, otherwise from Claude
// -----------------------------------------------------------------------------------------------------
const cacheFile = path.join(dir, "out", "ai-verdicts.json");
const previous = existsSync(cacheFile) ? readJson<Cache>(cacheFile) : null;
const cache: Cache = previous?.version === AI_VERSION ? previous : { version: AI_VERSION, model: AI_MODEL, answers: {}, stats: [] };
const missing = [...toJudge.values()].filter(({ article }) => !Object.hasOwn(cache.answers, article._id));

if (missing.length && args["dry-run"]) {
  console.log(`Dry run: ${missing.length} articles have no AI answer, so they count as the rules' verdicts.`);
} else if (missing.length) {
  const fromFile = args["env-file"] ? dotenv.parse(readFileSync(args["env-file"])).ANTHROPIC_API_KEY : undefined;
  const apiKey = process.env.ANTHROPIC_API_KEY || fromFile;
  if (!apiKey) {
    console.error(`${missing.length} articles need the AI, but ANTHROPIC_API_KEY isn't set (pass --env-file or set it).`);
    process.exit(2);
  }
  console.log(`Asking ${AI_MODEL} about ${missing.length} articles (version ${AI_VERSION})...`);
  const ai = new AiCheck(new Anthropic({ apiKey, maxRetries: 3, timeout: 60_000 }));
  await mapLimit(missing, 4, async ({ article, verdicts }) => {
    const answer = await ai.judge(article, verdicts);
    // Ads aren't sent, so they keep the rules' verdicts, as in the job. Failed calls are retried next time.
    if (answer) cache.answers[article._id] = Object.fromEntries(answer);
    else if (notSent(verdicts)) cache.answers[article._id] = null;
  });
  cache.stats.push(ai.stats);
  writeFileSync(cacheFile, JSON.stringify(cache, null, 1));
  console.log(`  ${ai.stats.calls} calls, ${ai.stats.failed} failed, about $${ai.stats.cost_usd.toFixed(4)}${ai.stats.error ? `; last error: ${ai.stats.error}` : ""}`);
}

const scored = rows.map((row) => {
  const ai = cache.answers[row.articleId]?.[row.ticker] ?? null;
  return { ...row, ai, final: ai?.verdict ?? row.rules.verdict };
});
const unanswered = scored.filter((row) => !Object.hasOwn(cache.answers, row.articleId)).length;

// -----------------------------------------------------------------------------------------------------
// Cost: what this many calls cost, and what the job would spend at this window's volume
// -----------------------------------------------------------------------------------------------------
const totals = cache.stats.reduce((sum, s) => ({ calls: sum.calls + s.calls, cost: sum.cost + s.cost_usd,
  input: sum.input + s.input_tokens + s.cache_write_tokens + s.cache_read_tokens, output: sum.output + s.output_tokens }),
{ calls: 0, cost: 0, input: 0, output: 0 });
let wouldSend = 0;
const seen = new Set<string>();
for (const article of news) {
  const judged = judgeByRules(article, until);
  if (!judged || seen.has(judged.article._id) || judged.article.published_at < since || judged.article.published_at >= until) continue;
  seen.add(judged.article._id);
  if (!notSent(judged.verdicts)) wouldSend += 1;
}
const windowDays = (until.getTime() - since.getTime()) / 86_400_000;
const perCall = totals.calls ? totals.cost / totals.calls : 0;
const perMonth = (wouldSend / windowDays) * 30;

// -----------------------------------------------------------------------------------------------------
// The report
// -----------------------------------------------------------------------------------------------------
const lines: string[] = [
  "# AI check score", "",
  `Model ${AI_MODEL}, AI check version ${AI_VERSION}. News from ${data.meta.window.since} to ${data.meta.window.until}.`,
  `${scored.length} Goalset 1 stories: ${scored.filter((r) => r.set === "g1_pick").length} rule picks and ${scored.filter((r) => r.set === "g1_drop").length} stories the rules dropped.`,
];
if (rulesDrift) lines.push(`Note: the job's rules disagree with the labelled rules on ${rulesDrift} stories.`);
if (unanswered) lines.push(`Note: ${unanswered} stories have no AI answer yet (a dry run or failed calls); they count as the rules' verdict.`);

lines.push("", "## Cost", "",
  `${totals.calls} calls so far, ${totals.input.toLocaleString()} input and ${totals.output.toLocaleString()} output tokens, about $${totals.cost.toFixed(4)} in total ($${perCall.toFixed(5)} per article).`,
  `The job would send about ${Math.round(perMonth).toLocaleString()} articles a month at this window's volume (${wouldSend} in ${Math.round(windowDays)} days), so about $${(perCall * perMonth).toFixed(2)} a month.`);

const picks = scored.filter((r) => r.set === "g1_pick");
const drops = scored.filter((r) => r.set === "g1_drop");
const agree = scored.filter((r) => r.final === r.rules.verdict).length;
lines.push("", "## The AI compared with the rules", "",
  `Same call on ${rate(agree, scored.length)}.`,
  `- Rule picks the AI would hide: ${picks.filter((r) => r.final === "drop").length} of ${picks.length}.`,
  `- Dropped stories the AI would show: ${drops.filter((r) => r.final === "show").length} of ${drops.length}.`);

let labels: Map<string, Label> | null = null;
if (args.labels) {
  const raw = readJson<Label[] | Record<string, Omit<Label, "id">>>(args.labels);
  const list = Array.isArray(raw) ? raw : Object.entries(raw).map(([id, value]) => ({ ...value, id }));
  labels = new Map(list.map((label) => [label.id, label]));
}

/** What the story should have been, from its label: "show", "drop", or null if unlabelled or unsure. */
function truth(row: (typeof scored)[number]) {
  const label = labels?.get(row.id);
  if (label?.verdict !== "right" && label?.verdict !== "wrong") return null;
  if (row.set === "g1_pick") return label.verdict === "right" || label.reason === "wrong_event" ? "show" : "drop";
  return label.verdict === "right" ? "drop" : "show";
}

if (labels) {
  const labelledPicks = picks.filter((r) => truth(r));
  const labelledDrops = drops.filter((r) => truth(r));
  const kept = labelledPicks.filter((r) => r.final === "show");
  const wrongPicks = labelledPicks.filter((r) => truth(r) === "drop");
  const missed = labelledDrops.filter((r) => truth(r) === "show");
  const junk = labelledDrops.filter((r) => truth(r) === "drop");
  const all = [...labelledPicks, ...labelledDrops];

  lines.push("", "## Against your labels", "",
    `Labelled (right or wrong, not "not sure"): ${labelledPicks.length} of ${picks.length} picks and ${labelledDrops.length} of ${drops.length} dropped stories.`,
    "", "**Stories shown in the rows (precision)**", "",
    `- Rules alone: ${rate(labelledPicks.length - wrongPicks.length, labelledPicks.length)} of picks are real news.`,
    `- With the AI check: ${rate(kept.filter((r) => truth(r) === "show").length, kept.length)} of the picks it keeps are real news.`,
    `- Wrong picks the AI removed: ${wrongPicks.filter((r) => r.final === "drop").length} of ${wrongPicks.length}. Right picks it removed by mistake: ${labelledPicks.filter((r) => truth(r) === "show" && r.final === "drop").length} of ${labelledPicks.length - wrongPicks.length}.`,
    "", "**Stories the rules dropped (misses)**", "",
    `- Real news the rules dropped: ${rate(missed.length, labelledDrops.length)}.`,
    `- Of those, the AI would show ${missed.filter((r) => r.final === "show").length} of ${missed.length}. It would wrongly show ${junk.filter((r) => r.final === "show").length} of the ${junk.length} that were right to drop.`,
    "", "**All labelled Goalset 1 stories** (the dropped ones are a sample, so this mixes two groups)", "",
    `- Rules right: ${rate(all.filter((r) => r.rules.verdict === truth(r)).length, all.length)}.`,
    `- AI right: ${rate(all.filter((r) => r.final === truth(r)).length, all.length)}.`);
}

const differ = scored.filter((r) => r.final !== r.rules.verdict || (labels && truth(r) && r.final !== truth(r)));
if (differ.length) {
  lines.push("", "## Stories where the AI and the rules disagree" + (labels ? ", or the AI got it wrong" : ""), "",
    `| | Ticker | Headline | Rules | AI | ${labels ? "Label | " : ""}AI's reason |`,
    `| --- | --- | --- | --- | --- | ${labels ? "--- | " : ""}--- |`);
  for (const r of differ) {
    const said = (v: { verdict: string; event: string; reason: string }) => (v.verdict === "show" ? `show (${v.event})` : `drop (${v.reason})`);
    const cell = (text: string) => text.replace(/\|/g, "/");
    lines.push(`| ${r.set === "g1_pick" ? "pick" : "dropped"} | ${r.ticker} | ${cell(r.title.slice(0, 90))} | ${said(r.rules)} | `
      + `${r.ai ? said(r.ai) : "rules kept"} | ${labels ? `${truth(r) ?? "—"} | ` : ""}${cell(r.ai?.note ?? "")} |`);
  }
}

const report = lines.join("\n") + "\n";
writeFileSync(path.join(dir, "out", "ai-score.md"), report);
console.log(report);
console.log(`Wrote ${path.join(dir, "out", "ai-score.md")}`);
