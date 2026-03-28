import { Router, type IRouter } from "express";
import fs from "fs";
import { parseLogs } from "../lib/haproxy-parser.js";

const router: IRouter = Router();

router.post("/parse", (req, res) => {
  const { content } = req.body as { content?: string };
  if (typeof content !== "string") {
    res.status(400).json({ error: "Missing content field" });
    return;
  }
  try {
    const report = parseLogs(content);
    res.json(report);
  } catch (err) {
    req.log.error({ err }, "Failed to parse logs");
    res.status(500).json({ error: "Failed to parse logs" });
  }
});

router.get("/stream", (req, res) => {
  const filePath = req.query["file"] as string | undefined;
  const sinceParam = req.query["since"] as string | undefined;

  if (!filePath) {
    res.status(400).json({ error: "file query parameter is required" });
    return;
  }

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: `File not found: ${filePath}` });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (data: string) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let offset = sinceParam ? parseInt(sinceParam, 10) : 0;

  if (!sinceParam) {
    try {
      const stat = fs.statSync(filePath);
      offset = Math.max(0, stat.size - 65536);
    } catch {
      offset = 0;
    }
  }

  const POLL_INTERVAL = 1000;

  const poll = () => {
    try {
      const stat = fs.statSync(filePath);
      const currentSize = stat.size;

      if (currentSize > offset) {
        const stream = fs.createReadStream(filePath, {
          start: offset,
          end: currentSize - 1,
          encoding: "utf8",
        });

        let buffer = "";
        stream.on("data", (chunk) => {
          buffer += chunk;
        });

        stream.on("end", () => {
          const lines = buffer.split("\n");
          for (const line of lines) {
            if (line.trim()) {
              sendEvent(line);
            }
          }
          offset = currentSize;
        });

        stream.on("error", (err) => {
          req.log.error({ err }, "Error reading log stream");
        });
      } else {
        res.write(": heartbeat\n\n");
      }
    } catch (err) {
      req.log.error({ err }, "Error polling log file");
    }
  };

  poll();
  const timer = setInterval(poll, POLL_INTERVAL);

  req.on("close", () => {
    clearInterval(timer);
  });
});

export default router;
