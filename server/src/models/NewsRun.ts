import mongoose, { Schema } from "mongoose";

// One run of the scheduled news job. The site reads these to say how fresh the news is, and the
// job reads them to know where the previous run left off.
export interface INewsRun {
  started_at: Date;
  finished_at: Date;
  news: {
    ok: boolean;
    since: Date | null; // the oldest publish time asked for
    pages: number;
    fetched: number; // articles Massive returned
    ours: number; // of those, tagged with one of our tickers
    new_articles: number;
    skipped: number; // already stored, so not judged again
    pairs: number; // new article-ticker verdicts
    shown: number; // of those, "show"
    error: string;
  };
  sec: {
    ok: boolean;
    mode: "full" | "recent" | "off"; // every company, only companies in the SEC's latest-filings list, or not run
    since: Date | null; // "recent" mode: how far back the latest-filings list was read
    companies: number; // companies whose filing list was read
    new_filings: number;
    skipped: number;
    shown: number;
    error: string;
    ciks?: Record<string, number>; // "full" mode: our ticker -> SEC company number, used by "recent" runs
  };
  pruned: { articles: number; verdicts: number; runs: number };
}

const NewsRunSchema = new Schema<INewsRun>(
  {
    started_at: { type: Date, required: true },
    finished_at: { type: Date, required: true },
    news: { type: Schema.Types.Mixed, required: true },
    sec: { type: Schema.Types.Mixed, required: true },
    pruned: { type: Schema.Types.Mixed, default: {} },
  },
  { collection: "news_runs", versionKey: false, minimize: false },
);

NewsRunSchema.index({ "news.ok": 1, started_at: -1 });
NewsRunSchema.index({ "sec.ok": 1, "sec.mode": 1, started_at: -1 });
NewsRunSchema.index({ started_at: -1 });

export default (mongoose.models.NewsRun as mongoose.Model<INewsRun>) ||
  mongoose.model<INewsRun>("NewsRun", NewsRunSchema);
