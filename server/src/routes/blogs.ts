import express, { Request, Response } from "express";
import Blog from "../models/Blog.js";
import connectDB from "../utils/connectDB.js";

const router = express.Router();

// Seed data for one-time migration
const seedData = [
  {
    title: "Welcome to Nodal",
    content: "# Welcome\n\nThis is your first blog post.",
    date: new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    authorName: "Admin",
  },
];

// GET /api/blogs - Get all blogs
router.get("/", async (req: Request, res: Response) => {
  try {
    await connectDB();

    let blogs = await Blog.find().sort({ createdAt: -1 });

    // One-time seed: if empty, migrate hardcoded entries
    if (blogs.length === 0 && seedData.length > 0) {
      await Blog.insertMany(seedData);
      blogs = await Blog.find().sort({ createdAt: -1 });
    }

    res.json(blogs);
  } catch (error: any) {
    console.error("Error fetching blogs:", error);
    res.status(500).json({ error: error.message || "Failed to fetch blogs" });
  }
});

// POST /api/blogs - Bulk update (replace all blogs)
router.post("/", async (req: Request, res: Response) => {
  try {
    await connectDB();

    const { blogs, passcode } = req.body;

    // Verify passcode only if ADMIN_PASSCODE is configured
    const adminPasscode = process.env.ADMIN_PASSCODE;
    if (adminPasscode && passcode !== adminPasscode) {
      return res.status(401).json({ error: "Invalid passcode" });
    }

    if (!Array.isArray(blogs)) {
      return res.status(400).json({ error: "Blogs must be an array" });
    }

    // Delete all existing blogs
    await Blog.deleteMany({});

    // Insert new blogs
    if (blogs.length > 0) {
      // Map frontend format to database format
      const blogsToInsert = blogs.map((blog: any) => ({
        title: blog.title,
        content: blog.content || "",
        date: blog.date,
        authorName: blog.authorName,
        authorProfilePicture: blog.authorProfilePicture,
      }));

      await Blog.insertMany(blogsToInsert);
    }

    const updatedBlogs = await Blog.find().sort({ createdAt: -1 });
    res.json(updatedBlogs);
  } catch (error: any) {
    console.error("Error saving blogs:", error);
    res.status(500).json({ error: error.message || "Failed to save blogs" });
  }
});

export default router;
