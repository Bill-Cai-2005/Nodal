import mongoose, { Document, Schema } from "mongoose";

export interface IStockConnection extends Document {
  ticker: string;
  connectedTickers: string[];
  createdAt: Date;
  updatedAt: Date;
}

const StockConnectionSchema = new Schema<IStockConnection>(
  {
    ticker: { type: String, required: true, uppercase: true, trim: true },
    connectedTickers: { type: [String], required: true, default: [] },
  },
  { timestamps: true },
);

export default mongoose.models.StockConnection ||
  mongoose.model<IStockConnection>("StockConnection", StockConnectionSchema);
