import express, { Request, Response } from "express";

const router = express.Router();

const OPENAI_URL = "https://api.openai.com/v1/responses";

const sanitizeTicker = (raw: string): string =>
    String(raw || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z.]/g, "")
        .slice(0, 10);

router.get("/:ticker", async (req: Request, res: Response) => {
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: "OPENAI_API_KEY is not configured on the server" });
        }

        const ticker = sanitizeTicker(req.params.ticker);
        if (!ticker) {
            return res.status(400).json({ error: "Valid ticker is required" });
        }

        const model = process.env.OPENAI_MODEL || "gpt-5.4";

        const upstream = await fetch(OPENAI_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                instructions:
                    "You are a financial research assistant. Write exactly one concise paragraph with factual, neutral tone. Do not invent current news.",
                input: `Write a one-paragraph company description for ticker ${ticker}. Include the company name, what the company does, and main business segments. If current notable news is unavailable, omit it.`,
                max_output_tokens: 180
            }),
        });

        if (!upstream.ok) {
            const text = await upstream.text();
            console.error("OpenAI error:", upstream.status, text);
            return res.status(upstream.status).json({
                error: "OpenAI API error",
                status: upstream.status,
                details: text,
            });
        }

        const data = await upstream.json() as any;

        const content =
            data.output
                ?.flatMap((item: any) => item.content || [])
                ?.filter((part: any) => part.type === "output_text")
                ?.map((part: any) => part.text)
                ?.join(" ")
                ?.replace(/\s+/g, " ")
                ?.trim() || "";

        if (!content) {
            console.error("Unexpected OpenAI response:", JSON.stringify(data, null, 2));
            return res.status(500).json({
                error: "No summary content returned by OpenAI",
                details: data
            });
        }

        return res.json({ ticker, summary: content });
    } catch (error: any) {
        console.error("Company summary route failed:", error);
        return res.status(500).json({ error: error.message || "Failed to generate company summary" });
    }
});

export default router;
