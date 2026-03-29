import { Router, type IRouter } from "express";

const router: IRouter = Router();

/** In-memory store for the latest dashboard screenshot */
let latest: { image: string; capturedAt: string } | null = null;

/**
 * POST /api/screenshot
 * Body: { image: "data:image/jpeg;base64,..." }
 * Called by the browser after the user clicks the screenshot button.
 * Stores the capture so GET /api/screenshot can return it on demand.
 */
router.post("/screenshot", (req, res) => {
  const { image } = req.body as { image?: string };
  if (typeof image !== "string" || !image.startsWith("data:image/")) {
    res.status(400).json({
      error: "Missing or invalid `image` field — must be a base64 data URL (data:image/jpeg;base64,...)",
    });
    return;
  }
  latest = { image, capturedAt: new Date().toISOString() };
  res.json({ ok: true, capturedAt: latest.capturedAt });
});

/**
 * GET /api/screenshot
 * Returns the most recent dashboard screenshot.
 *
 * By default returns JSON: { image: "data:image/jpeg;base64,...", capturedAt: "..." }
 * Add ?format=jpeg to get the raw JPEG bytes instead (useful for curl / monitoring tools).
 *
 * Returns 404 if no screenshot has been captured yet.
 */
router.get("/screenshot", (req, res) => {
  if (!latest) {
    res.status(404).json({
      error: "No screenshot captured yet. Open the dashboard in a browser and click the Screenshot button first.",
    });
    return;
  }

  if (req.query.format === "jpeg") {
    const base64 = latest.image.replace(/^data:image\/\w+;base64,/, "");
    const buf = Buffer.from(base64, "base64");
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Disposition", `inline; filename="msb-dashboard-${latest.capturedAt}.jpg"`);
    res.setHeader("X-Captured-At", latest.capturedAt);
    res.send(buf);
    return;
  }

  res.json({ image: latest.image, capturedAt: latest.capturedAt });
});

export default router;
