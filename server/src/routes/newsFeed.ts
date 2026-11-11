import express, { Request, Response } from "express";
import connectDB from "../utils/connectDB.js";
import { newsFeed, storeStatus } from "../utils/newsStore.js";

const router = express.Router();

// GET /api/news-feed -> material news from the last 3 days across all of our tickers, read from
// the database the scheduled news job fills (it never calls Massive). fetched_at is when the job
// last read Massive successfully; status is "stale" once that is over 3 hours ago. If the job has
// never finished, the answer is a 503 with status "empty".
router.get("/", async (_req: Request, res: Response) => {
  try {
    await connectDB();
    const status = await storeStatus();
    if (status.empty) {
      return res.status(503).json({ error: "News hasn't been collected yet (the scheduled news job hasn't run)", status: "empty" });
    }
    const feed = await newsFeed();
    return res.json({ fetched_at: status.fetched_at, ...feed, status: status.newsStale ? "stale" : "ok" });
  } catch (error: any) {
    console.error("Error in news feed route:", error);
    return res.status(500).json({ error: error.message || "News feed lookup failed" });
  }
});

export default router;
