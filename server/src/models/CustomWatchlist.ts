import mongoose, { Document, Schema } from "mongoose";

export interface ICustomWatchlist extends Document {
  name: string;
  tickers: string[];
  data: any[];
  lastRefreshed: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const CustomWatchlistSchema: Schema = new Schema(
  {
    name: { type: String, required: true, unique: true, index: true },
    tickers: { type: [String], required: true, default: [] },
    data: { type: [Schema.Types.Mixed], required: true, default: [] },
    lastRefreshed: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.CustomWatchlist ||
  mongoose.model<ICustomWatchlist>("CustomWatchlist", CustomWatchlistSchema);
