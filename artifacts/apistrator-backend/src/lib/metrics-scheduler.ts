import { metricsDb } from './metrics-db';
import { collectMetrics } from './metrics-collector';
import { logger } from './logger';
import { EventEmitter } from 'node:events';

export const metricsBus = new EventEmitter();
metricsBus.setMaxListeners(100);

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

async function runMetricsForServer(server: { ip: string; port: number }): Promise<void> {
  const full = metricsDb.getServer(server.ip);
  if (!full) {
    logger.warn({ ip: server.ip }, 'Metrics server not found in DB');
    return;
  }

  const hasPassword = !!(full.ssh_pass);
  const hasKey = !!(full.ssh_key);

  if (!hasPassword && !hasKey) {
    metricsDb.updateServerStatus(server.ip, 'unconfigured', null, 'No SSH credentials — click Edit SSH Config');
    return;
  }

  const effectivePort = full.port;
  logger.info({ ip: server.ip, port: effectivePort }, 'Collecting server metrics');
  metricsDb.updateServerStatus(server.ip, 'scanning');

  try {
    const data = await collectMetrics({
      host: server.ip,
      port: effectivePort,
      username: full.ssh_user || 'root',
      password: full.ssh_pass ?? undefined,
      privateKey: full.ssh_key ?? undefined,
      timeoutMs: 25_000,
    });

    metricsDb.saveScan(server.ip, data.cpu_usage, data.mem_usage, data.disks, data.hostname);
    metricsDb.updateServerStatus(server.ip, 'ok', data.hostname);
    logger.info({ ip: server.ip, cpu: data.cpu_usage, mem: data.mem_usage }, 'Metrics collected');
    metricsBus.emit('metrics', { serverIp: server.ip, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ ip: server.ip, err: msg }, 'Metrics collection failed');
    metricsDb.updateServerStatus(server.ip, 'error', null, msg);
    metricsBus.emit('metrics-error', { serverIp: server.ip, error: msg });
  }
}

export async function runAllMetrics(): Promise<void> {
  const servers = metricsDb.getServers().filter(s => s.enabled);
  await Promise.allSettled(servers.map(s => runMetricsForServer(s)));
}

export function runSingleMetrics(ip: string): Promise<void> {
  const server = metricsDb.getServer(ip);
  if (!server) throw new Error(`Unknown metrics server: ${ip}`);
  return runMetricsForServer(server);
}

export function startMetricsScheduler(): void {
  if (schedulerInterval) clearInterval(schedulerInterval);

  schedulerInterval = setInterval(async () => {
    await runAllMetrics();
  }, 5 * 60_000);

  logger.info('Metrics scheduler started (every 5 minutes)');

  // Initial collection after 8 seconds (staggered from security scan)
  setTimeout(() => runAllMetrics().catch(() => {}), 8_000);
}

export function stopMetricsScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
