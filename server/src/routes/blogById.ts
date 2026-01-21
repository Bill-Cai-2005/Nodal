import express, { Request, Response } from "express";
import Blog from "../models/Blog.js";
import connectDB from "../utils/connectDB.js";

const router = express.Router();

// GET /api/blogs/:id - Get a single blog by ID
router.get("/:id", async (req: Request, res: Response) => {
  try {
    await connectDB();

    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Blog ID is required" });
    }

    const blog = await Blog.findById(id);

    if (!blog) {
      return res.status(404).json({ error: "Blog not found" });
    }

    res.json(blog);
  } catch (error: any) {
    console.error("Error fetching blog:", error);
    res.status(500).json({ error: error.message || "Failed to fetch blog" });
  }
});

export default router;
