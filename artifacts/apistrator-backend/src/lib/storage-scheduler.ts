import { storageDb } from './storage-db';
import { collectStorageData } from './storage-collector';
import { logger } from './logger';
import { EventEmitter } from 'node:events';

export const storageBus = new EventEmitter();
storageBus.setMaxListeners(100);

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

async function runStorageForHost(host: { ip: string; port: number }): Promise<void> {
  const full = storageDb.getHost(host.ip);
  if (!full) {
    logger.warn({ ip: host.ip }, 'Storage host not found in DB');
    return;
  }

  if (!full.ssh_pass && !full.ssh_key) {
    storageDb.updateHostStatus(host.ip, 'unconfigured', null, 'No SSH credentials — click Edit to configure');
    return;
  }

  logger.info({ ip: host.ip, port: full.port }, 'Collecting Ceph storage data');
  storageDb.updateHostStatus(host.ip, 'scanning');

  try {
    const data = await collectStorageData({
      host: host.ip,
      port: full.port,
      username: full.ssh_user || 'root',
      password: full.ssh_pass ?? undefined,
      privateKey: full.ssh_key ?? undefined,
      timeoutMs: 90_000,
    });

    storageDb.saveScan(host.ip, data);
    storageDb.updateHostStatus(host.ip, 'ok', (data.hostname as string) ?? null);
    logger.info({ ip: host.ip }, 'Ceph storage data collected');
    storageBus.emit('storage', { hostIp: host.ip, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ ip: host.ip, err: msg }, 'Storage collection failed');
    storageDb.updateHostStatus(host.ip, 'error', null, msg);
    storageBus.emit('storage-error', { hostIp: host.ip, error: msg });
  }
}

export async function runAllStorage(): Promise<void> {
  const hosts = storageDb.getHosts().filter(h => h.enabled);
  await Promise.allSettled(hosts.map(h => runStorageForHost(h)));
}

export async function runSingleStorage(ip: string): Promise<void> {
  const host = storageDb.getHost(ip);
  if (!host) throw new Error(`Unknown storage host: ${ip}`);
  return runStorageForHost(host);
}

export function startStorageScheduler(): void {
  if (schedulerInterval) clearInterval(schedulerInterval);

  schedulerInterval = setInterval(async () => {
    await runAllStorage();
  }, 15 * 60_000);

  logger.info('Storage scheduler started (every 15 minutes)');

  setTimeout(() => runAllStorage().catch(() => {}), 15_000);
}

export function stopStorageScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
