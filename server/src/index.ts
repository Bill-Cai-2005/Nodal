import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import blogsRouter from "./routes/blogs.js";
import blogByIdRouter from "./routes/blogById.js";
import uploadImageRouter from "./routes/uploadImage.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// 1. Define allowed origins clearly
const allowedOrigins = [
  process.env.FRONTEND_URL, // e.g., https://your-app.vercel.app
  "http://localhost:5173",
  "http://localhost:3000",
  "https://nodalresearch.com",
].filter(Boolean);

// 2. Correct CORS Middleware Implementation
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like Postman or mobile apps)
    if (!origin) return callback(null, true);

    // Check if the origin is in our allowed list
    const isAllowed = allowedOrigins.includes(origin);

    // Check if it's a Vercel preview deployment
    const isVercelPreview = origin.endsWith(".vercel.app");

    if (isAllowed || isVercelPreview) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Body parsing middleware - exclude upload route to allow formidable to handle multipart/form-data
app.use((req, res, next) => {
  if (req.path.startsWith("/api/upload-image")) {
    return next();
  }
  express.json()(req, res, next);
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/upload-image")) {
    return next();
  }
  express.urlencoded({ extended: true })(req, res, next);
});

// Serve static files from public directory
app.use(express.static("public"));
app.use("/blog-images", express.static("public/blog-images"));

// API Routes
app.use("/api/blogs", blogsRouter);
app.use("/api/blogs", blogByIdRouter);
app.use("/api/upload-image", uploadImageRouter);

// Health check
app.get("/health", (_req: express.Request, res: express.Response) => {
  res.json({ status: "ok" });
});

// Handle Chrome DevTools requests (harmless, can be ignored)
app.get("/.well-known/appspecific/com.chrome.devtools.json", (_req: express.Request, res: express.Response) => {
  res.status(404).json({});
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
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
process.on("uncaughtException", (error: Error) => {
  console.error("Uncaught Exception:", error);
  gracefulShutdown("uncaughtException");
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  gracefulShutdown("unhandledRejection");
});
