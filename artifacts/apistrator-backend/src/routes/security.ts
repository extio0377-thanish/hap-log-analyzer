import { Router } from 'express';
import { securityDb } from '../lib/security-db';
import { runSingleScan } from '../lib/security-scheduler';
import { securityBus } from '../lib/security-scheduler';

const router = Router();

// ── GET /api/security/servers ──────────────────────────────────────────────
router.get('/servers', (_req, res) => {
  res.json(securityDb.getServers());
});

// ── POST /api/security/servers ─────────────────────────────────────────────
router.post('/servers', (req, res) => {
  const { ip, port } = req.body as { ip: string; port?: number };
  if (!ip) return res.status(400).json({ error: 'ip required' });
  securityDb.addServer(ip, port ?? 7779);
  res.json({ ok: true });
});

// ── DELETE /api/security/servers/:ip ──────────────────────────────────────
router.delete('/servers/:ip', (req, res) => {
  securityDb.removeServer(req.params.ip);
  res.json({ ok: true });
});

// ── GET /api/security/scan/:ip ─────────────────────────────────────────────
router.get('/scan/:ip', (req, res) => {
  const scan = securityDb.getLatestScan(req.params.ip);
  if (!scan) return res.status(404).json({ error: 'No scan data yet' });
  res.json({ ...scan, raw_data: JSON.parse(scan.raw_data) });
});

// ── GET /api/security/history/:ip ─────────────────────────────────────────
router.get('/history/:ip', (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 30), 60);
  res.json(securityDb.getRecentScans(req.params.ip, limit));
});

// ── POST /api/security/scan/:ip/trigger ───────────────────────────────────
router.post('/scan/:ip/trigger', async (req, res) => {
  try {
    runSingleScan(req.params.ip).catch(() => {});
    res.json({ ok: true, message: 'Scan triggered' });
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// ── GET /api/security/ssh-config ──────────────────────────────────────────
router.get('/ssh-config', (_req, res) => {
  const cfg = securityDb.getSshConfig();
  // Never return the actual password/key — mask them
  res.json({
    ssh_user:      cfg.ssh_user,
    ssh_port:      cfg.ssh_port,
    ssh_auth_type: cfg.ssh_auth_type,
    has_password:  !!cfg.ssh_pass,
    has_key:       !!cfg.ssh_key,
    updated_at:    cfg.updated_at,
  });
});

// ── PUT /api/security/ssh-config ──────────────────────────────────────────
router.put('/ssh-config', (req, res) => {
  const { ssh_user, ssh_port, ssh_auth_type, ssh_pass, ssh_key } = req.body as Record<string, string>;
  securityDb.updateSshConfig({ ssh_user, ssh_port: Number(ssh_port), ssh_auth_type, ssh_pass, ssh_key });
  res.json({ ok: true });
});

// ── GET /api/security/stream (SSE) ────────────────────────────────────────
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Send current state immediately
  const servers = securityDb.getServers();
  send('init', { servers });

  const onScan = (payload: { serverIp: string; data: unknown }) => {
    send('scan', payload);
  };
  const onError = (payload: { serverIp: string; error: string }) => {
    send('scan-error', payload);
  };

  securityBus.on('scan', onScan);
  securityBus.on('scan-error', onError);

  // Keepalive ping every 20s
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);

  req.on('close', () => {
    clearInterval(ping);
    securityBus.off('scan', onScan);
    securityBus.off('scan-error', onError);
  });
});

export default router;
