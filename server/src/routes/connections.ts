import express, { Request, Response } from "express";
import connectDB from "../utils/connectDB.js";
import StockConnection from "../models/StockConnection.js";
import { authorizeAdminPassword } from "../utils/adminAuth.js";

const router = express.Router();
const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,9}$/;
let legacyConnectionsMigrated = false;

function normalizeTicker(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function getAdminPassword(req: Request): unknown {
  return req.header("x-admin-password") || req.body?.password;
}

function requireAdmin(req: Request, res: Response): boolean {
  const authorization = authorizeAdminPassword(getAdminPassword(req));
  if (!authorization.ok) {
    res.status(authorization.status).json({ error: authorization.error });
    return false;
  }
  return true;
}

function normalizePair(source: unknown, target: unknown) {
  const sourceTicker = normalizeTicker(source);
  const targetTicker = normalizeTicker(target);

  if (
    !TICKER_PATTERN.test(sourceTicker) ||
    !TICKER_PATTERN.test(targetTicker) ||
    sourceTicker === targetTicker
  ) {
    return null;
  }

  return { sourceTicker, targetTicker };
}

async function migrateLegacyConnections() {
  if (legacyConnectionsMigrated) return;

  const collection = StockConnection.collection;
  try {
    await collection.dropIndex("sourceTicker_1_targetTicker_1");
  } catch (error: any) {
    if (error?.codeName !== "IndexNotFound") throw error;
  }

  const legacyPairs = await collection
    .find({
      sourceTicker: { $exists: true },
      targetTicker: { $exists: true },
    })
    .project({ sourceTicker: 1, targetTicker: 1 })
    .toArray();

  if (legacyPairs.length > 0) {
    const connectedByTicker = new Map<string, Set<string>>();
    for (const pair of legacyPairs) {
      const normalized = normalizePair(pair.sourceTicker, pair.targetTicker);
      if (!normalized) continue;

      if (!connectedByTicker.has(normalized.sourceTicker)) {
        connectedByTicker.set(normalized.sourceTicker, new Set());
      }
      if (!connectedByTicker.has(normalized.targetTicker)) {
        connectedByTicker.set(normalized.targetTicker, new Set());
      }
      connectedByTicker
        .get(normalized.sourceTicker)!
        .add(normalized.targetTicker);
      connectedByTicker
        .get(normalized.targetTicker)!
        .add(normalized.sourceTicker);
    }

    await collection.deleteMany({
      sourceTicker: { $exists: true },
      targetTicker: { $exists: true },
    });

    await StockConnection.bulkWrite(
      [...connectedByTicker.entries()].map(([ticker, connectedTickers]) => ({
        updateOne: {
          filter: { ticker },
          update: {
            $set: { ticker, connectedTickers: [...connectedTickers] },
          },
          upsert: true,
        },
      })),
    );
  }

  await collection.createIndex({ ticker: 1 }, { unique: true });
  legacyConnectionsMigrated = true;
}

// GET /api/connections - Public graph data grouped by ticker node.
router.get("/", async (_req: Request, res: Response) => {
  try {
    await connectDB();
    await migrateLegacyConnections();
    const nodes = await StockConnection.find(
      {},
      { _id: 1, ticker: 1, connectedTickers: 1, createdAt: 1 },
    )
      .sort({ ticker: 1 })
      .lean();
    return res.json({ nodes });
  } catch (error) {
    console.error("Error fetching stock connections:", error);
    return res.status(500).json({ error: "Failed to fetch stock connections" });
  }
});

// POST /api/connections - Admin-only connection creation.
router.post("/", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const pair = normalizePair(req.body?.sourceTicker, req.body?.targetTicker);
  if (!pair) {
    return res.status(400).json({
      error:
        "sourceTicker and targetTicker must be different valid stock tickers",
    });
  }

  try {
    await connectDB();
    await migrateLegacyConnections();
    const [sourceNode, targetNode] = await Promise.all([
      StockConnection.findOneAndUpdate(
        { ticker: pair.sourceTicker },
        { $addToSet: { connectedTickers: pair.targetTicker } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean(),
      StockConnection.findOneAndUpdate(
        { ticker: pair.targetTicker },
        { $addToSet: { connectedTickers: pair.sourceTicker } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean(),
    ]);
    return res.status(201).json({ nodes: [sourceNode, targetNode] });
  } catch (error) {
    console.error("Error creating stock connection:", error);
    return res.status(500).json({ error: "Failed to create stock connection" });
  }
});

// DELETE /api/connections - Admin-only connection removal.
router.delete("/", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const pair = normalizePair(req.body?.sourceTicker, req.body?.targetTicker);
  if (!pair) {
    return res.status(400).json({
      error:
        "sourceTicker and targetTicker must be different valid stock tickers",
    });
  }

  try {
    await connectDB();
    await migrateLegacyConnections();
    const [sourceResult, targetResult] = await Promise.all([
      StockConnection.updateOne(
        { ticker: pair.sourceTicker },
        { $pull: { connectedTickers: pair.targetTicker } },
      ),
      StockConnection.updateOne(
        { ticker: pair.targetTicker },
        { $pull: { connectedTickers: pair.sourceTicker } },
      ),
    ]);

    if (sourceResult.modifiedCount === 0 && targetResult.modifiedCount === 0) {
      return res.status(404).json({ error: "Stock connection not found" });
    }
    return res.status(204).send();
  } catch (error) {
    console.error("Error deleting stock connection:", error);
    return res.status(500).json({ error: "Failed to delete stock connection" });
  }
});

export default router;
