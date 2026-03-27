import mongoose, { Document, Schema } from "mongoose";

export interface ICustomWatchlistCategory extends Document {
  name: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const CustomWatchlistCategorySchema: Schema = new Schema(
  {
    name: { type: String, required: true, unique: true, index: true },
    order: { type: Number, required: true, default: 0, index: true },
  },
  { timestamps: true }
);

export default mongoose.models.CustomWatchlistCategory ||
  mongoose.model<ICustomWatchlistCategory>("CustomWatchlistCategory", CustomWatchlistCategorySchema);
