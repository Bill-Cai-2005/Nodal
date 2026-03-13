import mongoose, { Schema, Document } from "mongoose";

export interface IStartPriceCache extends Document {
  dateKey: string; // YYYY-MM-DD
  cachedAt: Date;
  prices: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

const StartPriceCacheSchema: Schema = new Schema(
  {
    dateKey: { type: String, required: true, unique: true, index: true },
    cachedAt: { type: Date, required: true },
    prices: { type: Schema.Types.Mixed, required: true }, // { TICKER: price }
  },
  { timestamps: true }
);

export default mongoose.models.StartPriceCache ||
  mongoose.model<IStartPriceCache>("StartPriceCache", StartPriceCacheSchema);

