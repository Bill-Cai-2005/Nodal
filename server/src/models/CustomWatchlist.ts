import mongoose, { Document, Schema } from "mongoose";

export interface ICustomWatchlist extends Document {
  name: string;
  description: string;
  order: number;
  category: string;
  tickers: string[];
  stockDescriptions: Record<string, string>;
  stockSubcategories: Record<string, string>;
  data: any[];
  lastRefreshed: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const CustomWatchlistSchema: Schema = new Schema(
  {
    name: { type: String, required: true, unique: true, index: true },
    description: { type: String, required: true, default: "" },
    order: { type: Number, required: true, default: 0, index: true },
    category: { type: String, required: true, default: "Uncategorized", index: true },
    tickers: { type: [String], required: true, default: [] },
    stockDescriptions: { type: Schema.Types.Mixed, required: true, default: {} },
    stockSubcategories: { type: Schema.Types.Mixed, required: true, default: {} },
    data: { type: [Schema.Types.Mixed], required: true, default: [] },
    lastRefreshed: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.CustomWatchlist ||
  mongoose.model<ICustomWatchlist>("CustomWatchlist", CustomWatchlistSchema);
