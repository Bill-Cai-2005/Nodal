import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";

process.env.NODE_ENV = "test";
process.env.TOOL_PASSWORD = "test-admin-password";

const mongoServer = await MongoMemoryServer.create();
process.env.MONGO_URI = mongoServer.getUri();

const { default: app } = await import("../index.js");
const { default: StockConnection } = await import("../models/StockConnection.js");

before(async () => {
  await mongoose.connect(process.env.MONGO_URI!, { bufferCommands: false });
});

beforeEach(async () => {
  await StockConnection.deleteMany({});
});

after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

test("serves the health endpoint", async () => {
  const response = await request(app).get("/health").expect(200);
  assert.deepEqual(response.body, { status: "ok" });
});

test("connects over HTTP and persists a bidirectional ticker graph", async () => {
  const createResponse = await request(app)
    .post("/api/connections")
    .set("x-admin-password", "test-admin-password")
    .send({ sourceTicker: " aapl ", targetTicker: "msft" })
    .expect(201);

  assert.deepEqual(
    createResponse.body.nodes.map((node: { ticker: string; connectedTickers: string[] }) => ({
      ticker: node.ticker,
      connectedTickers: node.connectedTickers,
    })),
    [
      { ticker: "AAPL", connectedTickers: ["MSFT"] },
      { ticker: "MSFT", connectedTickers: ["AAPL"] },
    ],
  );

  assert.deepEqual(
    await StockConnection.find({}, { _id: 0, ticker: 1, connectedTickers: 1 })
      .sort({ ticker: 1 })
      .lean(),
    [
      { ticker: "AAPL", connectedTickers: ["MSFT"] },
      { ticker: "MSFT", connectedTickers: ["AAPL"] },
    ],
  );

  const readResponse = await request(app).get("/api/connections").expect(200);
  assert.deepEqual(
    readResponse.body.nodes.map((node: { ticker: string; connectedTickers: string[] }) => ({
      ticker: node.ticker,
      connectedTickers: node.connectedTickers,
    })),
    [
      { ticker: "AAPL", connectedTickers: ["MSFT"] },
      { ticker: "MSFT", connectedTickers: ["AAPL"] },
    ],
  );
});

test("does not duplicate an existing connection", async () => {
  const payload = {
    sourceTicker: "AAPL",
    targetTicker: "MSFT",
  };

  await request(app)
    .post("/api/connections")
    .set("x-admin-password", "test-admin-password")
    .send(payload)
    .expect(201);
  await request(app)
    .post("/api/connections")
    .set("x-admin-password", "test-admin-password")
    .send(payload)
    .expect(201);

  assert.deepEqual(
    await StockConnection.find({}, { _id: 0, ticker: 1, connectedTickers: 1 })
      .sort({ ticker: 1 })
      .lean(),
    [
      { ticker: "AAPL", connectedTickers: ["MSFT"] },
      { ticker: "MSFT", connectedTickers: ["AAPL"] },
    ],
  );
});

test("rejects unauthorized writes and invalid graph pairs", async () => {
  await request(app)
    .post("/api/connections")
    .set("x-admin-password", "wrong-password")
    .send({ sourceTicker: "AAPL", targetTicker: "MSFT" })
    .expect(401);

  const invalidResponse = await request(app)
    .post("/api/connections")
    .set("x-admin-password", "test-admin-password")
    .send({ sourceTicker: "AAPL", targetTicker: "aapl" })
    .expect(400);

  assert.deepEqual(invalidResponse.body, {
    error: "sourceTicker and targetTicker must be different valid stock tickers",
  });
  assert.equal(await StockConnection.countDocuments(), 0);
});

test("removes both directions from the database", async () => {
  await request(app)
    .post("/api/connections")
    .set("x-admin-password", "test-admin-password")
    .send({ sourceTicker: "AAPL", targetTicker: "MSFT" })
    .expect(201);

  await request(app)
    .delete("/api/connections")
    .set("x-admin-password", "test-admin-password")
    .send({ sourceTicker: "aapl", targetTicker: " msft " })
    .expect(204);

  assert.equal(await StockConnection.countDocuments(), 2);
  assert.deepEqual(
    await StockConnection.find({}, { _id: 0, ticker: 1, connectedTickers: 1 })
      .sort({ ticker: 1 })
      .lean(),
    [
      { ticker: "AAPL", connectedTickers: [] },
      { ticker: "MSFT", connectedTickers: [] },
    ],
  );
});
