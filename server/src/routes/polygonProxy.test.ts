import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPolygonRequest } from "./polygonProxy.js";

// Same URL building as the proxy: base + path, then the client's query string.
const check = (pathAndQuery: string) => checkPolygonRequest(new URL(`https://api.polygon.io${pathAndQuery}`));

test("allows every request src/utils/polygonApi.ts makes", () => {
  const allowed = [
    // fetchTickerReferenceRow (validateTicker, fetchTickerReference)
    "/v3/reference/tickers/AAPL",
    "/v3/reference/tickers/BRK.B",
    "/v3/reference/tickers/BF-B",
    "/v3/reference/tickers/005930:XKRX",
    // fetchStockData: last 7 days, then the two 14-day custom-range windows
    "/v2/aggs/ticker/AAPL/range/1/day/2026-10-29/2026-11-05?adjusted=true&sort=asc&limit=5000",
    "/v2/aggs/ticker/AAPL/range/1/day/2026-01-02/2026-01-16?adjusted=true&sort=asc&limit=50",
    "/v2/aggs/ticker/005930:XKRX/range/1/day/2026-10-22/2026-11-05?adjusted=true&sort=asc&limit=50",
    // fetchNyseNasdaqTickers, first page and a later page
    "/v3/reference/tickers?market=stocks&active=true&limit=1000",
    "/v3/reference/tickers?market=stocks&active=true&limit=1000&cursor=YWN0aXZlPXRydWUmYXA9",
    // fetchSnapshotBatch
    "/v2/snapshot/locale/us/markets/stocks/tickers?tickers=AAPL,MSFT,BRK.B",
    `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${Array(250).fill("AAPL").join(",")}`,
  ];
  for (const path of allowed) {
    assert.equal(check(path), null, path);
  }
});

test("blocks Massive endpoints the site does not use", () => {
  const blocked = [
    "/",
    "/v3/reference/tickers/",
    "/v2/reference/news?ticker=AAPL",
    "/v3/trades/AAPL",
    "/v3/quotes/AAPL",
    "/v3/snapshot/options/AAPL",
    "/vX/reference/financials?ticker=AAPL",
    "/v1/open-close/AAPL/2026-01-09",
    "/v2/snapshot/locale/us/markets/stocks/gainers",
    "/v3/reference/tickers/AAPL/events",
    // path tricks that try to reach another endpoint
    "/v3/reference/tickers/../../v3/trades/AAPL",
    "/v3/reference/tickers/..%2F..%2Fv3%2Ftrades%2FAAPL",
    "/v3/reference/tickers/AAPL%3Fx=1",
  ];
  for (const path of blocked) {
    assert.notEqual(check(path), null, path);
  }
});

test("blocks oversized or unexpected parameters on allowed endpoints", () => {
  const blocked = [
    // more bars than any caller needs
    "/v2/aggs/ticker/AAPL/range/1/day/1990-01-01/2026-11-05?adjusted=true&sort=asc&limit=5000",
    "/v2/aggs/ticker/AAPL/range/1/day/2026-10-29/2026-11-05?limit=50000",
    "/v2/aggs/ticker/AAPL/range/1/minute/2026-10-29/2026-11-05",
    "/v2/aggs/ticker/AAPL/range/1/day/1700000000000/1700600000000",
    "/v3/reference/tickers?market=stocks&active=true&limit=5000",
    "/v3/reference/tickers?market=options",
    "/v3/reference/tickers?search=apple",
    "/v3/reference/tickers/AAPL?date=2020-01-01",
    // full-market snapshot (no tickers) and oversized batches
    "/v2/snapshot/locale/us/markets/stocks/tickers",
    `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${Array(251).fill("AAPL").join(",")}`,
    // a client-supplied key, and prototype names, are not allowed params
    "/v3/reference/tickers/AAPL?apiKey=someone-elses",
    "/v3/reference/tickers/AAPL?constructor=1",
    "/v3/reference/tickers/AAPL?__proto__=1",
  ];
  for (const path of blocked) {
    assert.notEqual(check(path), null, path);
  }
});
