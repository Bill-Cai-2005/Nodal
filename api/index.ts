import dotenv from "dotenv";

// Load environment variables FIRST, before importing any modules that use them
dotenv.config();

import express from "express";
import cors from "cors";
import blogsRouter from "../server/src/routes/blogs.js";
import blogByIdRouter from "../server/src/routes/blogById.js";
import uploadImageRouter from "../server/src/routes/uploadImage.js";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use("/blogs", blogsRouter);
app.use("/blogs", blogByIdRouter);
app.use("/upload-image", uploadImageRouter);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Handle Chrome DevTools requests
app.get("/.well-known/appspecific/com.chrome.devtools.json", (req, res) => {
  res.status(404).json({});
});

// Export the Express app as a serverless function (Vercel needs this)
export default app;
