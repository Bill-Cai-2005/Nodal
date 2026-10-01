import assert from "node:assert/strict";
import test from "node:test";
import {
  groupConnectionPairs,
  normalizePair,
  normalizeTicker,
} from "./stockConnections.js";

test("normalizes ticker values used by graph nodes", () => {
  assert.equal(normalizeTicker("  aapl "), "AAPL");
  assert.equal(normalizeTicker(null), "");
  assert.equal(normalizeTicker(undefined), "");
});

test("accepts valid distinct ticker pairs and rejects invalid pairs", () => {
  assert.deepEqual(normalizePair(" aapl ", "msft"), {
    sourceTicker: "AAPL",
    targetTicker: "MSFT",
  });
  assert.equal(normalizePair("AAPL", "aapl"), null);
  assert.equal(normalizePair("AAPL!", "MSFT"), null);
  assert.equal(normalizePair("AAPL", "this-ticker-is-too-long"), null);
});

test("groups legacy pairs into a bidirectional ticker graph", () => {
  const output = groupConnectionPairs([
    { sourceTicker: "aapl", targetTicker: "msft" },
    { sourceTicker: "MSFT", targetTicker: "NVDA" },
    { sourceTicker: "NVDA", targetTicker: "AAPL" },
    { sourceTicker: "AAPL", targetTicker: "MSFT" },
    { sourceTicker: "AAPL", targetTicker: "AAPL" },
    { sourceTicker: "bad!", targetTicker: "TSLA" },
  ]);

  assert.deepEqual(output, [
    { ticker: "AAPL", connectedTickers: ["MSFT", "NVDA"] },
    { ticker: "MSFT", connectedTickers: ["AAPL", "NVDA"] },
    { ticker: "NVDA", connectedTickers: ["MSFT", "AAPL"] },
  ]);
});

test("returns no nodes when all legacy pairs are invalid", () => {
  assert.deepEqual(
    groupConnectionPairs([
      { sourceTicker: "AAPL", targetTicker: "AAPL" },
      { sourceTicker: "", targetTicker: "MSFT" },
      { sourceTicker: "bad!", targetTicker: "MSFT" },
    ]),
    [],
  );
});
