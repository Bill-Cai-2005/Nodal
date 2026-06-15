import mongoose, { Document, Schema } from "mongoose";

export interface ICustomWatchlistCategory extends Document {
  name: string;
  order: number;
  resourceTab: string;
  createdAt: Date;
  updatedAt: Date;
}

const CustomWatchlistCategorySchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    order: { type: Number, required: true, default: 0, index: true },
    resourceTab: { type: String, required: true, default: "ai-buildout", index: true },
  },
  { timestamps: true }
);

CustomWatchlistCategorySchema.index({ name: 1, resourceTab: 1 }, { unique: true });

export default mongoose.models.CustomWatchlistCategory ||
  mongoose.model<ICustomWatchlistCategory>("CustomWatchlistCategory", CustomWatchlistCategorySchema);
