import express, { Request, Response } from "express";

const router = express.Router();

// POST /api/admin/tool-password
// Body: { password: string }
// Returns: { ok: boolean }
router.post("/tool-password", async (req: Request, res: Response) => {
  try {
    const configured = process.env.TOOL_PASSWORD;
    if (!configured) {
      return res.status(500).json({ ok: false, error: "TOOL_PASSWORD is not configured on the server" });
    }

    const { password } = req.body || {};
    const matches = typeof password === "string" && password === configured;

    if (!matches) {
      return res.status(401).json({ ok: false, error: "Invalid password" });
    }

    return res.json({ ok: true });
  } catch (error: any) {
    console.error("Error validating TOOL_PASSWORD:", error);
    return res.status(500).json({ ok: false, error: error.message || "Failed to validate password" });
  }
});

export default router;

