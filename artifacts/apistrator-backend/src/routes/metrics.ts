import { Router } from 'express';
import { metricsDb } from '../lib/metrics-db';
import { metricsBus, runSingleMetrics } from '../lib/metrics-scheduler';
import { requirePermission } from '../lib/auth-middleware';

const router = Router();

// ── GET /api/metrics/servers ─────────────────────────────────────────────────
router.get('/servers', requirePermission('view_metrics'), (_req, res) => {
  res.json(metricsDb.getServers());
});

// ── POST /api/metrics/servers ─────────────────────────────────────────────────
router.post('/servers', requirePermission('manage_metrics'), (req, res) => {
  const { ip, port } = req.body as { ip: string; port?: number };
  if (!ip) return res.status(400).json({ error: 'ip is required' });
  metricsDb.addServer(ip.trim(), Number(port) || 22);
  res.json({ ok: true });
});

// ── DELETE /api/metrics/servers/:ip ──────────────────────────────────────────
router.delete('/servers/:ip', requirePermission('manage_metrics'), (req, res) => {
  metricsDb.removeServer(req.params.ip);
  res.json({ ok: true });
});

// ── GET /api/metrics/latest ───────────────────────────────────────────────────
// Returns latest scan data for ALL servers (used by heatmap)
router.get('/latest', requirePermission('view_metrics'), (_req, res) => {
  const all = metricsDb.getLatestForAll();
  const result = all.map(({ server, scan }) => ({
    ip: server.ip,
    port: server.port,
    hostname: scan?.hostname ?? server.hostname ?? server.ip,
    last_scan_status: server.last_scan_status,
    last_scan_at: server.last_scan_at,
    last_error: server.last_error,
    cpu_usage: scan?.cpu_usage ?? null,
    mem_usage: scan?.mem_usage ?? null,
    disks: scan ? JSON.parse(scan.disk_json) : [],
  }));
  res.json(result);
});

// ── GET /api/metrics/history/:ip ─────────────────────────────────────────────
router.get('/history/:ip', requirePermission('view_metrics'), (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 60, 120);
  const scans = metricsDb.getRecentScans(req.params.ip, limit);
  res.json(scans.map(s => ({
    id: s.id,
    collected_at: s.collected_at,
    cpu_usage: s.cpu_usage,
    mem_usage: s.mem_usage,
    disks: JSON.parse(s.disk_json),
  })).reverse());
});

// ── POST /api/metrics/trigger/:ip ────────────────────────────────────────────
router.post('/trigger/:ip', requirePermission('view_metrics'), async (req, res) => {
  try {
    res.json({ ok: true, message: 'Collection started' });
    await runSingleMetrics(req.params.ip);
  } catch (e) {
    // Already responded; error emitted via bus
  }
});

// ── GET /api/metrics/stream (SSE) ────────────────────────────────────────────
router.get('/stream', requirePermission('view_metrics'), (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (name: string, data: unknown) => {
    res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const onMetrics = (d: unknown) => sendEvent('metrics', d);
  const onError = (d: unknown) => sendEvent('metrics-error', d);

  metricsBus.on('metrics', onMetrics);
  metricsBus.on('metrics-error', onError);

  req.on('close', () => {
    metricsBus.off('metrics', onMetrics);
    metricsBus.off('metrics-error', onError);
  });
});

export default router;
