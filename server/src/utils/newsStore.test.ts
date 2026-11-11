import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";

// Runs against a throwaway in-memory database, never a real one.
process.env.NODE_ENV = "test";
const mongoServer = await MongoMemoryServer.create();
process.env.MONGO_URI = mongoServer.getUri();

const { default: app } = await import("../index.js");
const { default: NewsArticle } = await import("../models/NewsArticle.js");
const { default: NewsRun } = await import("../models/NewsRun.js");
const { default: NewsVerdict } = await import("../models/NewsVerdict.js");
const { storeNewArticles } = await import("../jobs/ingestNews.js");
const { classify, compileNames, NAMES } = await import("./newsRules.js");
const store = await import("./newsStore.js");

const HOUR = 60 * 60 * 1000;
const now = new Date();
// Whole seconds, like Massive's and the SEC's times.
const hoursAgo = (hours: number) => new Date(Math.floor((now.getTime() - hours * HOUR) / 1000) * 1000);
const utc = (hours: number) => hoursAgo(hours).toISOString().replace(/\.\d{3}Z$/, "Z");
const article = (id: string, title: string, tickers: string[], hours: number, publisher = "Zacks Investment Research") => ({
  id,
  title,
  article_url: `https://example.com/${id}`,
  published_utc: utc(hours),
  tickers,
  publisher: { name: publisher },
});

const okRun = (finishedHoursAgo: number) => ({
  started_at: hoursAgo(finishedHoursAgo),
  finished_at: hoursAgo(finishedHoursAgo),
  news: { ok: true },
  sec: { ok: true, mode: "full" },
  pruned: {},
});

const saveFiling = (accession: string, ticker: string, hours: number, event: string) => store.saveJudged([{
  article: {
    _id: `sec:${accession}`, source: "sec", title: `${ticker} filing ${accession}`, url: `https://www.sec.gov/${accession}`,
    publisher: "8-K", description: "", published_utc: utc(hours), published_at: hoursAgo(hours), tickers: [ticker], form: "8-K", items: ["2.02"], cik: 1, first_seen_at: now,
  },
  verdicts: [{ ticker, verdict: "show", event, reason: "", judge: "rules", rules: { verdict: "show", event, reason: "" } }],
}], now);

before(async () => {
  await mongoose.connect(process.env.MONGO_URI!, { bufferCommands: false });
  await Promise.all([NewsArticle.init(), NewsRun.init(), NewsVerdict.init()]);
});

beforeEach(async () => {
  await Promise.all([NewsArticle.deleteMany({}), NewsRun.deleteMany({}), NewsVerdict.deleteMany({})]);
});

after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

test("judges new articles once and skips them on the next run", async () => {
  const batch = [
    article("a1", "Nvidia Launches New AI Chip", ["NVDA"], 1, "GlobeNewswire Inc."),
    article("a2", "Microsoft Q1 Earnings Beat Estimates", ["MSFT", "AAPL"], 2),
    article("a3", "Apple Unveils New iPhone", ["AAPL"], 3), // none of our tickers: not stored
    article("a1", "Nvidia Launches New AI Chip", ["NVDA"], 1, "GlobeNewswire Inc."), // same article twice
  ];
  const first = await storeNewArticles(batch, now);
  assert.deepEqual(first, { ours: 2, new_articles: 2, skipped: 0, pairs: 2, shown: 2 });

  const second = await storeNewArticles([...batch, article("a4", "Microsoft Signs Cloud Deal", ["MSFT"], 0.5)], now);
  assert.deepEqual(second, { ours: 3, new_articles: 1, skipped: 2, pairs: 1, shown: 1 });
  assert.equal(await NewsArticle.countDocuments(), 3);
  assert.equal(await NewsVerdict.countDocuments(), 3);
  assert.deepEqual((await NewsArticle.findById("news:a2").lean())?.tickers, ["MSFT", "AAPL"]);
});

test("gives each article-ticker pair the old routes' verdict, including the 3-company rule", async () => {
  const roundup = article("r1", "Nvidia, AMD and Intel Earnings Beat Estimates", ["NVDA", "AMD", "INTC"], 1);
  const two = article("r2", "Nvidia and AMD Sign Chip Supply Agreement", ["NVDA", "AMD", "GOOGL"], 1);
  await storeNewArticles([roundup, two], now);

  for (const item of [roundup, two]) {
    const tagged = [...new Set(item.tickers.map(store.alias))];
    const ours = tagged.filter(store.isOurTicker);
    const named = ours.filter((t) => store.namePatterns[t].some((p) => p.test(item.title))).length;
    for (const ticker of ours) {
      const [verdict, reason, event] = classify(item.title, item.publisher.name, tagged, ticker,
        compileNames(NAMES[ticker], ticker), named);
      const saved = await NewsVerdict.findOne({ article_id: `news:${item.id}`, ticker }).lean();
      assert.deepEqual({ verdict: saved?.verdict, reason: saved?.reason, event: saved?.event, judge: saved?.judge },
        { verdict, reason, event, judge: "rules" }, `${item.id} ${ticker}`);
    }
  }
  assert.equal((await NewsVerdict.findOne({ article_id: "news:r1", ticker: "NVDA" }).lean())?.reason, "market roundup");
  assert.deepEqual((await NewsArticle.findById("news:r2").lean())?.tickers, ["NVDA", "AMD", "GOOG"]); // GOOGL counts as GOOG
});

test("latest pick per ticker: newest that passed, an article wins a tie with a filing, 14 days back", async () => {
  await storeNewArticles([
    article("m1", "Microsoft Q1 Earnings Beat Estimates", ["MSFT"], 10),
    article("m2", "Is Microsoft Stock a Buy Now?", ["MSFT"], 1), // newer, but opinion: dropped
    article("m3", "Microsoft Signs Cloud Deal", ["MSFT"], 15 * 24), // passes, but older than 14 days
    article("n1", "Nvidia Launches New AI Chip", ["NVDA"], 5, "GlobeNewswire Inc."),
  ], now);
  await saveFiling("0001-26-000001", "NVDA", 5, "Earnings / guidance"); // same time as n1
  await saveFiling("0001-26-000002", "INTC", 30, "Leadership");

  const picks = await store.tickerPicks(["MSFT", "NVDA", "INTC", "AMD"], now);
  assert.deepEqual(picks.map((p) => [p.ticker, p.pick?.title ?? null, p.pick?.source ?? null, p.checked]), [
    ["MSFT", "Microsoft Q1 Earnings Beat Estimates", "news", 2],
    ["NVDA", "Nvidia Launches New AI Chip", "news", 1],
    ["INTC", "INTC filing 0001-26-000002", "sec", 0],
    ["AMD", null, null, 0],
  ]);

  await saveFiling("0001-26-000003", "NVDA", 4, "Deal / contract / M&A"); // newer than n1: the filing wins
  const [nvda] = await store.tickerPicks(["NVDA"], now);
  assert.deepEqual(nvda.pick, {
    title: "NVDA filing 0001-26-000003", url: "https://www.sec.gov/0001-26-000003", publisher: "8-K",
    published_utc: utc(4), event: "Deal / contract / M&A", source: "sec",
  });
});

test("the feed lists each story once, newest first, with the tickers it passed for in tag order", async () => {
  await storeNewArticles([
    article("f1", "Nvidia and AMD Sign Chip Supply Agreement", ["AMD", "NVDA"], 2),
    article("f2", "Microsoft Q1 Earnings Beat Estimates", ["MSFT"], 1),
    article("f3", "Is Nvidia a Buy Now?", ["NVDA"], 1.5), // dropped
    article("f4", "Microsoft Signs Cloud Deal", ["MSFT"], 4 * 24), // older than 3 days
  ], now);
  await saveFiling("0001-26-000004", "MSFT", 0.5, "Earnings / guidance"); // filings aren't in the feed

  const feed = await store.newsFeed(now);
  assert.equal(feed.days, 3);
  assert.equal(feed.checked, 3);
  assert.deepEqual(feed.items.map((i) => [i.title, i.tickers.map((t) => t.ticker)]), [
    ["Microsoft Q1 Earnings Beat Estimates", ["MSFT"]],
    ["Nvidia and AMD Sign Chip Supply Agreement", ["AMD", "NVDA"]],
  ]);
});

test("pruning deletes articles, verdicts and runs older than the cutoff", async () => {
  await storeNewArticles([
    article("p1", "Microsoft Q1 Earnings Beat Estimates", ["MSFT"], 31 * 24),
    article("p2", "Microsoft Signs Cloud Deal", ["MSFT"], 1),
  ], now);
  await NewsRun.create([okRun(31 * 24), okRun(1)]);
  const pruned = await store.pruneBefore(store.daysBefore(now, store.KEEP_DAYS));
  assert.deepEqual(pruned, { articles: 1, verdicts: 1, runs: 1 });
  assert.deepEqual((await NewsArticle.find().lean()).map((a) => a._id), ["news:p2"]);
});

test("the routes answer from the store and say when it is empty or stale", async () => {
  const empty = await request(app).get("/api/news/NVDA").expect(503);
  assert.equal(empty.body.status, "empty");
  await request(app).get("/api/news-feed").expect(503);

  await storeNewArticles([article("e1", "Nvidia Launches New AI Chip", ["NVDA"], 1, "GlobeNewswire Inc.")], now);
  await NewsRun.create(okRun(0.1));

  const nvda = await request(app).get("/api/news/nvda").expect(200);
  assert.equal(nvda.body.status, "ok");
  assert.equal(nvda.body.pick.title, "Nvidia Launches New AI Chip");
  assert.equal(nvda.body.checked, 1);
  assert.ok(nvda.body.fetched_at);

  const untracked = await request(app).get("/api/news/AAPL").expect(200);
  assert.deepEqual([untracked.body.status, untracked.body.pick], ["not_tracked", null]);

  const all = await request(app).get("/api/news").expect(200);
  assert.equal(Object.keys(all.body.tickers).length, store.OUR_TICKERS.length);
  assert.equal(all.body.tickers.NVDA.pick.title, "Nvidia Launches New AI Chip");

  const feed = await request(app).get("/api/news-feed").expect(200);
  assert.deepEqual([feed.body.status, feed.body.items.length, feed.body.days], ["ok", 1, 3]);

  await NewsRun.deleteMany({});
  await NewsRun.create(okRun(4)); // the job last succeeded 4 hours ago
  assert.equal((await request(app).get("/api/news/NVDA").expect(200)).body.status, "stale");
  assert.equal((await request(app).get("/api/news-feed").expect(200)).body.status, "stale");
});
