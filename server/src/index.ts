import dotenv from "dotenv";

// Load environment variables FIRST, before importing any modules that use them
dotenv.config();

import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import blogsRouter from "./routes/blogs.js";
import blogByIdRouter from "./routes/blogById.js";
import uploadImageRouter from "./routes/uploadImage.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
// CORS configuration - allow Vercel frontend and localhost for development
const allowedOrigins = [
  process.env.FRONTEND_URL, // Your Vercel URL (set in Render env vars)
  "http://localhost:5173", // Vite dev server
  "http://localhost:3000", // Alternative local dev
].filter(Boolean); // Remove undefined values

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.) in development only
    if (!origin) {
      if (process.env.NODE_ENV === "production") {
        return callback(new Error("Not allowed by CORS"));
      }
      return callback(null, true);
    }
    
    // In production, only allow FRONTEND_URL
    // In development, allow localhost origins
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else if (process.env.NODE_ENV !== "production" && origin.startsWith("http://localhost")) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static("public"));
app.use("/blog-images", express.static("public/blog-images"));

// API Routes
app.use("/api/blogs", blogsRouter);
app.use("/api/blogs", blogByIdRouter);
app.use("/api/upload-image", uploadImageRouter);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Handle Chrome DevTools requests (harmless, can be ignored)
app.get("/.well-known/appspecific/com.chrome.devtools.json", (req, res) => {
  res.status(404).json({});
});

const server = app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
}).on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`\n❌ Port ${PORT} is already in use!`);
    console.error(`\nTo fix this, either:`);
    console.error(`1. Stop the process using port ${PORT}:`);
    console.error(`   Windows: netstat -ano | findstr :${PORT}  (then kill the PID)`);
    console.error(`   Mac/Linux: lsof -ti:${PORT} | xargs kill`);
    console.error(`2. Or change the PORT in server/.env\n`);
    process.exit(1);
  } else {
    throw error;
  }
});

// Graceful shutdown handling
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  
  server.close(async () => {
    console.log("HTTP server closed.");
    
    // Close MongoDB connection if it exists
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.connection.close();
        console.log("MongoDB connection closed.");
      } catch (error) {
        console.error("Error closing MongoDB connection:", error);
      }
    }
    
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error("Could not close connections in time, forcefully shutting down");
    process.exit(1);
  }, 10000);
};

// Handle termination signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  gracefulShutdown("uncaughtException");
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  gracefulShutdown("unhandledRejection");
});
