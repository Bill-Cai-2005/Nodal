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

test("lets browsers send the admin header and PATCH across origins", async () => {
  const response = await request(app)
    .options("/api/connections/nodes/AAPL")
    .set("Origin", "https://nodalresearch.com")
    .set("Access-Control-Request-Method", "PATCH")
    .set("Access-Control-Request-Headers", "content-type,x-admin-password")
    .expect(204);

  assert.match(response.headers["access-control-allow-headers"], /x-admin-password/i);
  assert.match(response.headers["access-control-allow-methods"], /PATCH/);
});

test("places a ticker on the map and moves it", async () => {
  await request(app)
    .patch("/api/connections/nodes/nvda")
    .set("x-admin-password", "test-admin-password")
    .send({ position: { x: 120, y: -40 } })
    .expect(200);
  const moved = await request(app)
    .patch("/api/connections/nodes/NVDA")
    .set("x-admin-password", "test-admin-password")
    .send({ position: { x: 300.5, y: 80 } })
    .expect(200);

  assert.equal(moved.body.node.ticker, "NVDA");
  assert.deepEqual(moved.body.node.position, { x: 300.5, y: 80 });
  assert.deepEqual(moved.body.node.connectedTickers, []);
  assert.equal(await StockConnection.countDocuments(), 1);

  const readResponse = await request(app).get("/api/connections").expect(200);
  assert.deepEqual(readResponse.body.nodes[0].position, { x: 300.5, y: 80 });
});

test("keeps an existing ticker's connections when it is moved", async () => {
  await request(app)
    .post("/api/connections")
    .set("x-admin-password", "test-admin-password")
    .send({ sourceTicker: "AAPL", targetTicker: "MSFT" })
    .expect(201);
  await request(app)
    .patch("/api/connections/nodes/AAPL")
    .set("x-admin-password", "test-admin-password")
    .send({ position: { x: 1, y: 2 } })
    .expect(200);

  const node = await StockConnection.findOne({ ticker: "AAPL" }).lean<{
    connectedTickers: string[];
    position: { x: number; y: number } | null;
  }>();
  assert.deepEqual(node?.connectedTickers, ["MSFT"]);
  assert.deepEqual(node?.position, { x: 1, y: 2 });
});

test("rejects unauthorized or invalid placements", async () => {
  await request(app)
    .patch("/api/connections/nodes/AAPL")
    .send({ position: { x: 1, y: 2 } })
    .expect(401);
  await request(app)
    .patch("/api/connections/nodes/AAPL")
    .set("x-admin-password", "test-admin-password")
    .send({ position: { x: "1", y: 2 } })
    .expect(400);
  await request(app)
    .patch("/api/connections/nodes/BAD!")
    .set("x-admin-password", "test-admin-password")
    .send({ position: { x: 1, y: 2 } })
    .expect(400);
  assert.equal(await StockConnection.countDocuments(), 0);
});

test("removing a ticker from the map clears its connections on both sides", async () => {
  for (const targetTicker of ["MSFT", "NVDA"]) {
    await request(app)
      .post("/api/connections")
      .set("x-admin-password", "test-admin-password")
      .send({ sourceTicker: "AAPL", targetTicker })
      .expect(201);
  }
  await request(app)
    .post("/api/connections")
    .set("x-admin-password", "test-admin-password")
    .send({ sourceTicker: "MSFT", targetTicker: "NVDA" })
    .expect(201);
  await request(app)
    .patch("/api/connections/nodes/AAPL")
    .set("x-admin-password", "test-admin-password")
    .send({ position: { x: 1, y: 2 } })
    .expect(200);

  await request(app)
    .delete("/api/connections/nodes/aapl")
    .set("x-admin-password", "test-admin-password")
    .expect(204);

  assert.deepEqual(
    await StockConnection.find({}, { _id: 0, ticker: 1, connectedTickers: 1, position: 1 })
      .sort({ ticker: 1 })
      .lean(),
    [
      { ticker: "AAPL", connectedTickers: [], position: null },
      { ticker: "MSFT", connectedTickers: ["NVDA"], position: null },
      { ticker: "NVDA", connectedTickers: ["MSFT"], position: null },
    ],
  );

  await request(app)
    .delete("/api/connections/nodes/TSLA")
    .set("x-admin-password", "test-admin-password")
    .expect(404);
});
