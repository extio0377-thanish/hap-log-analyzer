import { Router } from 'express';
import { storageDb } from '../lib/storage-db';
import { storageBus, runSingleStorage } from '../lib/storage-scheduler';
import { requirePermission } from '../lib/auth-middleware';

const router = Router();

function maskHost(h: ReturnType<typeof storageDb.getHost>) {
  if (!h) return null;
  const { ssh_pass, ssh_key, ...rest } = h;
  return { ...rest, has_password: !!ssh_pass, has_key: !!ssh_key };
}

// GET /api/storage/hosts
router.get('/hosts', requirePermission('view_storage'), (_req, res) => {
  res.json(storageDb.getHosts().map(maskHost));
});

// POST /api/storage/hosts
router.post('/hosts', requirePermission('manage_storage'), (req, res) => {
  const { ip, port, label, ssh_user, ssh_auth_type, ssh_pass, ssh_key } = req.body as Record<string, string>;
  if (!ip) return res.status(400).json({ error: 'ip is required' });
  storageDb.addHost(ip.trim(), Number(port) || 22, {
    label: label || undefined,
    ssh_user: ssh_user || 'root',
    ssh_auth_type: ssh_auth_type || 'password',
    ssh_pass: ssh_pass || null,
    ssh_key: ssh_key || null,
  });
  res.json({ ok: true });
});

// PUT /api/storage/hosts/:ip/ssh
router.put('/hosts/:ip/ssh', requirePermission('manage_storage'), (req, res) => {
  const { label, ssh_user, ssh_auth_type, ssh_pass, ssh_key } = req.body as Record<string, string>;
  storageDb.updateHostSsh(req.params.ip, {
    label: label ?? undefined,
    ssh_user: ssh_user || undefined,
    ssh_auth_type: ssh_auth_type || undefined,
    ssh_pass: ssh_pass || null,
    ssh_key: ssh_key || null,
  });
  res.json({ ok: true });
});

// DELETE /api/storage/hosts/:ip
router.delete('/hosts/:ip', requirePermission('manage_storage'), (req, res) => {
  storageDb.removeHost(req.params.ip);
  res.json({ ok: true });
});

// GET /api/storage/latest — all hosts with latest scan summary
router.get('/latest', requirePermission('view_storage'), (_req, res) => {
  const hosts = storageDb.getHosts();
  const result = hosts.map(h => {
    const scan = storageDb.getLatestScan(h.ip);
    let cephData: Record<string, unknown> | null = null;
    if (scan) {
      try { cephData = JSON.parse(scan.raw_json); } catch {}
    }
    return {
      ip: h.ip,
      port: h.port,
      label: h.label,
      hostname: scan?.hostname ?? h.hostname ?? h.ip,
      ssh_user: h.ssh_user ?? 'root',
      ssh_auth_type: h.ssh_auth_type ?? 'password',
      has_password: !!h.ssh_pass,
      has_key: !!h.ssh_key,
      last_scan_status: h.last_scan_status,
      last_scan_at: h.last_scan_at,
      last_error: h.last_error,
      ceph: cephData,
      scan_id: scan?.id ?? null,
    };
  });
  res.json(result);
});

// GET /api/storage/scan/:ip — full latest scan for one host
router.get('/scan/:ip', requirePermission('view_storage'), (req, res) => {
  const scan = storageDb.getLatestScan(req.params.ip);
  if (!scan) return res.status(404).json({ error: 'No scan found' });
  let ceph: Record<string, unknown> = {};
  try { ceph = JSON.parse(scan.raw_json); } catch {}
  res.json({ ...scan, ceph });
});

// GET /api/storage/history/:ip — scan timestamps (no raw_json)
router.get('/history/:ip', requirePermission('view_storage'), (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 24, 48);
  res.json(storageDb.getRecentScans(req.params.ip, limit).reverse());
});

// POST /api/storage/trigger/:ip — manual scan
router.post('/trigger/:ip', requirePermission('view_storage'), async (req, res) => {
  try {
    res.json({ ok: true, message: 'Collection started' });
    await runSingleStorage(req.params.ip);
  } catch {
    // already responded
  }
});

// GET /api/storage/stream (SSE)
router.get('/stream', requirePermission('view_storage'), (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (name: string, data: unknown) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  const onStorage = (d: unknown) => send('storage', d);
  const onError = (d: unknown) => send('storage-error', d);

  storageBus.on('storage', onStorage);
  storageBus.on('storage-error', onError);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);

  req.on('close', () => {
    clearInterval(ping);
    storageBus.off('storage', onStorage);
    storageBus.off('storage-error', onError);
  });
});

export default router;
