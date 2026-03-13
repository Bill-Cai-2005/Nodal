import mongoose, { Schema, Document } from "mongoose";

export interface IMarketCapSnapshot extends Document {
  timestamp: Date;
  marketCaps: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

const MarketCapSnapshotSchema: Schema = new Schema(
  {
    timestamp: { type: Date, required: true, index: true },
    marketCaps: { type: Schema.Types.Mixed, required: true }, // { TICKER: marketCap }
  },
  { timestamps: true }
);

// helpful for "latest" queries
MarketCapSnapshotSchema.index({ timestamp: -1 });

export default mongoose.models.MarketCapSnapshot ||
  mongoose.model<IMarketCapSnapshot>("MarketCapSnapshot", MarketCapSnapshotSchema);

