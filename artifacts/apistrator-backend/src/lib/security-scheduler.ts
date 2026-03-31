import { securityDb } from './security-db';
import { collectFromServer } from './ssh-collector';
import { logger } from './logger';
import { EventEmitter } from 'node:events';

export const securityBus = new EventEmitter();
securityBus.setMaxListeners(100);

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

async function runScanForServer(ip: string, port: number): Promise<void> {
  const cfg = securityDb.getSshConfig();
  if (!cfg.ssh_pass && !cfg.ssh_key) {
    logger.warn({ ip }, 'No SSH credentials configured — skipping security scan');
    securityDb.updateServerStatus(ip, 'unconfigured', 'No SSH credentials set');
    return;
  }

  logger.info({ ip, port }, 'Starting security scan');
  securityDb.updateServerStatus(ip, 'scanning');

  try {
    const data = await collectFromServer({
      host: ip,
      port,
      username: cfg.ssh_user || 'root',
      password: cfg.ssh_pass ?? undefined,
      privateKey: cfg.ssh_key ?? undefined,
      timeoutMs: 55000,
    });

    securityDb.saveScan(ip, data);
    securityDb.updateServerStatus(ip, 'ok');
    logger.info({ ip }, 'Security scan completed');

    securityBus.emit('scan', { serverIp: ip, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ ip, err: msg }, 'Security scan failed');
    securityDb.updateServerStatus(ip, 'error', msg);
    securityBus.emit('scan-error', { serverIp: ip, error: msg });
  }
}

export async function runAllScans(): Promise<void> {
  const servers = securityDb.getServers().filter(s => s.enabled);
  await Promise.allSettled(servers.map(s => runScanForServer(s.ip, s.port)));
}

export function runSingleScan(ip: string): Promise<void> {
  const server = securityDb.getServer(ip);
  if (!server) throw new Error(`Unknown server: ${ip}`);
  return runScanForServer(server.ip, server.port);
}

export function startScheduler(): void {
  if (schedulerInterval) clearInterval(schedulerInterval);

  // Run every 60 seconds (same as '* * * * *' cron)
  schedulerInterval = setInterval(async () => {
    await runAllScans();
  }, 60_000);

  logger.info('Security scan scheduler started (every 1 minute)');

  // Run immediately on startup after a short delay to let server fully start
  setTimeout(() => runAllScans().catch(() => {}), 5000);
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
