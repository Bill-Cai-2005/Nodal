import mongoose, { Schema } from "mongoose";

export type Judgement = { verdict: "show" | "drop"; event: string; reason: string };

// Is this article news for this ticker? One per article-ticker pair, since one article can be
// real news for one company and a passing mention of another. Saved once, when the article is new.
export interface INewsVerdict extends Judgement {
  article_id: string; // NewsArticle._id
  ticker: string;
  source: "news" | "sec";
  published_at: Date; // copied from the article so the queries below need only this collection
  // event: the event type when shown, e.g. "Earnings / guidance"; reason: why it was dropped
  judge: "rules" | "ai"; // who made the call: the rules today, the AI check once it is approved
  rules: Judgement; // what the rules said, kept even when the AI makes the call, to compare the two
  judged_at: Date;
}

const JudgementSchema = new Schema<Judgement>(
  {
    verdict: { type: String, enum: ["show", "drop"], required: true },
    event: { type: String, default: "" },
    reason: { type: String, default: "" },
  },
  { _id: false },
);

const NewsVerdictSchema = new Schema<INewsVerdict>(
  {
    article_id: { type: String, required: true },
    ticker: { type: String, required: true },
    source: { type: String, enum: ["news", "sec"], required: true },
    published_at: { type: Date, required: true },
    verdict: { type: String, enum: ["show", "drop"], required: true },
    event: { type: String, default: "" },
    reason: { type: String, default: "" },
    judge: { type: String, enum: ["rules", "ai"], required: true },
    rules: { type: JudgementSchema, required: true },
    judged_at: { type: Date, required: true },
  },
  { collection: "news_verdicts", versionKey: false },
);

NewsVerdictSchema.index({ article_id: 1, ticker: 1 }, { unique: true }); // one verdict per pair
NewsVerdictSchema.index({ ticker: 1, verdict: 1, published_at: -1 }); // latest pick per ticker
NewsVerdictSchema.index({ ticker: 1, source: 1, published_at: -1 }); // articles checked per ticker
NewsVerdictSchema.index({ source: 1, verdict: 1, published_at: -1 }); // the feed

export default (mongoose.models.NewsVerdict as mongoose.Model<INewsVerdict>) ||
  mongoose.model<INewsVerdict>("NewsVerdict", NewsVerdictSchema);
