import mongoose, { Schema } from "mongoose";

// One news article or SEC filing, saved once by the scheduled news job (src/jobs/ingestNews.ts).
// Whether it counts as news for each ticker it is tagged with is in NewsVerdict.
export interface INewsArticle {
  _id: string; // "news:<Massive article id>" or "sec:<accession number>"
  source: "news" | "sec";
  title: string;
  url: string;
  publisher: string; // for a filing: its form, e.g. "8-K"
  description: string; // Massive's short summary; empty for filings
  published_utc: string; // as the source gave it; for a filing, when the SEC accepted it
  published_at: Date; // the same moment as a date, for sorting and time windows
  tickers: string[]; // every ticker it is tagged with (GOOGL counted as GOOG), in the source's order
  form?: string; // filings only
  items?: string[]; // filings only: 8-K item numbers
  cik?: number; // filings only: the company's SEC number
  first_seen_at: Date;
}

const NewsArticleSchema = new Schema<INewsArticle>(
  {
    _id: { type: String, required: true },
    source: { type: String, enum: ["news", "sec"], required: true },
    title: { type: String, default: "" },
    url: { type: String, default: "" },
    publisher: { type: String, default: "" },
    description: { type: String, default: "" },
    published_utc: { type: String, default: "" },
    published_at: { type: Date, required: true },
    tickers: { type: [String], default: [] },
    form: String,
    items: { type: [String], default: undefined },
    cik: Number,
    first_seen_at: { type: Date, required: true },
  },
  { collection: "news_articles", versionKey: false },
);

// The feed counts recent articles; pruning removes old ones.
NewsArticleSchema.index({ source: 1, published_at: -1 });

export default (mongoose.models.NewsArticle as mongoose.Model<INewsArticle>) ||
  mongoose.model<INewsArticle>("NewsArticle", NewsArticleSchema);
