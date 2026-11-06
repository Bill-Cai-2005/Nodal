import express, { Request, Response } from "express";
import fetch from "node-fetch";

const router = express.Router();

const POLYGON_BASE_URL = "https://api.polygon.io";

/*
 * Allowlist: the proxy only forwards the Massive (formerly Polygon.io) requests
 * the site actually makes. Anything else gets a 403, so nobody can use this
 * open endpoint to spend our API quota on other Massive data.
 *
 * Every caller lives in src/utils/polygonApi.ts. If you add a new Massive call
 * there, add its path and query parameters here too.
 */

type ParamCheck = (value: string) => boolean;

interface AllowedRequest {
  /** Matched against the path we would send to Massive, e.g. /v3/reference/tickers/AAPL */
  path: RegExp;
  /** Allowed query parameters and a check for each value. Anything not listed is refused. */
  params: Record<string, ParamCheck>;
  /** Query parameters that must be present. */
  required?: string[];
  /** Extra checks on the parts captured by `path`. */
  check?: (match: RegExpExecArray) => boolean;
}

// One ticker in a path, e.g. AAPL, BRK.B, BF-B, 005930:XKRX. No "/" or "%",
// so a ticker can't smuggle in a different Massive path.
const TICKER = "([A-Za-z0-9.:_\\-]+)";
const DATE = "(\\d{4}-\\d{2}-\\d{2})";

// Callers ask for at most a 14-day window of daily bars; 31 days leaves headroom.
const MAX_BAR_RANGE_DAYS = 31;
// polygonApi.ts sends snapshots in batches of 250 tickers (SNAPSHOT_BATCH_SIZE).
const MAX_SNAPSHOT_TICKERS = 250;
const DAY_MS = 24 * 60 * 60 * 1000;

const oneOf =
  (...allowed: string[]): ParamCheck =>
  (value) =>
    allowed.includes(value);
const wholeNumberUpTo =
  (max: number): ParamCheck =>
  (value) =>
    /^\d{1,6}$/.test(value) && Number(value) >= 1 && Number(value) <= max;
const nonEmpty: ParamCheck = (value) => value.length > 0;
const tickerList: ParamCheck = (value) =>
  value.length > 0 && value.split(",").length <= MAX_SNAPSHOT_TICKERS;

const ALLOWED_REQUESTS: AllowedRequest[] = [
  // Ticker details: market cap, industry, and "is this a real stock?" checks.
  {
    path: new RegExp(`^/v3/reference/tickers/${TICKER}$`),
    params: {},
  },
  // Daily price bars: current price, daily change, custom date range change.
  {
    path: new RegExp(`^/v2/aggs/ticker/${TICKER}/range/1/day/${DATE}/${DATE}$`),
    params: {
      adjusted: oneOf("true", "false"),
      sort: oneOf("asc", "desc"),
      limit: wholeNumberUpTo(5000),
    },
    check: (match) => {
      const days = (Date.parse(match[3]) - Date.parse(match[2])) / DAY_MS;
      return days <= MAX_BAR_RANGE_DAYS;
    },
  },
  // List of all active US stocks (Universal watchlist), paged with a cursor.
  {
    path: /^\/v3\/reference\/tickers$/,
    params: {
      market: oneOf("stocks"),
      active: oneOf("true", "false"),
      limit: wholeNumberUpTo(1000),
      cursor: nonEmpty,
    },
  },
  // Snapshot prices for a batch of tickers (Universal watchlist quick refresh).
  {
    path: /^\/v2\/snapshot\/locale\/us\/markets\/stocks\/tickers$/,
    params: { tickers: tickerList },
    required: ["tickers"],
  },
];

/**
 * Decide whether a Massive URL may go through the proxy.
 * Returns null if it is allowed, or a short reason if it is not.
 */
export const checkPolygonRequest = (url: URL): string | null => {
  for (const rule of ALLOWED_REQUESTS) {
    const match = rule.path.exec(url.pathname);
    if (!match) continue;

    if (rule.check && !rule.check(match)) {
      return "Request not allowed by the Nodal proxy: path values out of range";
    }
    for (const name of rule.required ?? []) {
      if (!url.searchParams.has(name)) {
        return `Request not allowed by the Nodal proxy: missing query parameter "${name}"`;
      }
    }
    for (const [name, value] of url.searchParams) {
      if (!Object.hasOwn(rule.params, name)) {
        return `Request not allowed by the Nodal proxy: query parameter "${name}"`;
      }
      if (!rule.params[name](value)) {
        return `Request not allowed by the Nodal proxy: value of "${name}"`;
      }
    }
    return null;
  }
  return "Request not allowed by the Nodal proxy: this Massive endpoint is not used by the site";
};

router.get("/*", async (req: Request, res: Response) => {
  try {
    const path = req.params[0] || "";
    const cleanPath = path.startsWith("/") ? path : `/${path}`;

    const url = new URL(`${POLYGON_BASE_URL}${cleanPath}`);
    // Forward all original query params
    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value)) {
        value.forEach((v) => url.searchParams.append(key, String(v)));
      } else if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    }

    // Check the final URL (after the path is normalised and the query is built),
    // before our API key is added.
    const blockedReason = checkPolygonRequest(url);
    if (blockedReason) {
      console.warn("Polygon proxy blocked:", url.pathname.slice(0, 200), "-", blockedReason);
      return res.status(403).json({ error: blockedReason });
    }

    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "POLYGON_API_KEY is not configured on the server" });
    }

    // Ensure apiKey is set from server env, overriding any client value
    url.searchParams.set("apiKey", apiKey);

    const upstream = await fetch(url.toString(), { method: "GET" });
    const contentType = upstream.headers.get("content-type") || "";

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error("Polygon proxy error:", upstream.status, text);
      return res.status(upstream.status).json({
        error: "Polygon API error",
        status: upstream.status,
        body: text,
      });
    }

    if (contentType.includes("application/json")) {
      const json = await upstream.json();
      return res.json(json);
    } else {
      const text = await upstream.text();
      return res.type(contentType).send(text);
    }
  } catch (error: any) {
    console.error("Error in Polygon proxy:", error);
    return res.status(500).json({ error: error.message || "Polygon proxy failed" });
  }
});

export default router;
