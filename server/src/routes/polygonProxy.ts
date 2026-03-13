import express, { Request, Response } from "express";
import fetch from "node-fetch";

const router = express.Router();

const POLYGON_BASE_URL = "https://api.polygon.io";

router.get("/*", async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "POLYGON_API_KEY is not configured on the server" });
    }

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

