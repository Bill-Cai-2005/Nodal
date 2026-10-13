import mongoose, { Document, Schema } from "mongoose";

export interface IStockConnection extends Document {
  ticker: string;
  connectedTickers: string[];
  // Where the ticker sits on the money flow map; null while it is in the inventory.
  position: { x: number; y: number } | null;
  createdAt: Date;
  updatedAt: Date;
}

const MapPositionSchema = new Schema(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
  },
  { _id: false },
);

const StockConnectionSchema = new Schema<IStockConnection>(
  {
    ticker: { type: String, required: true, uppercase: true, trim: true },
    connectedTickers: { type: [String], required: true, default: [] },
    position: { type: MapPositionSchema, default: null },
  },
  { timestamps: true },
);

export default mongoose.models.StockConnection ||
  mongoose.model<IStockConnection>("StockConnection", StockConnectionSchema);
