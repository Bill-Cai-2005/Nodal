import express, { Request, Response } from "express";
import connectDB from "../utils/connectDB.js";
import StockConnection from "../models/StockConnection.js";
import { authorizeAdminPassword } from "../utils/adminAuth.js";
import {
  groupConnectionPairs,
  normalizePair,
  normalizeTicker,
} from "../utils/stockConnections.js";

const router = express.Router();
let legacyConnectionsMigrated = false;

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
    await collection.deleteMany({
      sourceTicker: { $exists: true },
      targetTicker: { $exists: true },
    });

    await StockConnection.bulkWrite(
      groupConnectionPairs(legacyPairs).map(({ ticker, connectedTickers }) => ({
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
