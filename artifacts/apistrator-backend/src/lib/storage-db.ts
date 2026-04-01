import db from './db';

db.exec(`
  CREATE TABLE IF NOT EXISTS storage_hosts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL UNIQUE,
    port INTEGER DEFAULT 22,
    enabled INTEGER DEFAULT 1,
    hostname TEXT,
    label TEXT,
    last_scan_at TEXT,
    last_scan_status TEXT DEFAULT 'pending',
    last_error TEXT,
    ssh_user TEXT DEFAULT 'root',
    ssh_auth_type TEXT DEFAULT 'password',
    ssh_pass TEXT,
    ssh_key TEXT
  );

  CREATE TABLE IF NOT EXISTS storage_scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    host_ip TEXT NOT NULL,
    collected_at TEXT NOT NULL,
    hostname TEXT,
    raw_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_storage_scans_ip
    ON storage_scans(host_ip, created_at DESC);
`);

export interface StorageHost {
  id: number;
  ip: string;
  port: number;
  enabled: number;
  hostname: string | null;
  label: string | null;
  last_scan_at: string | null;
  last_scan_status: string;
  last_error: string | null;
  ssh_user: string | null;
  ssh_auth_type: string | null;
  ssh_pass: string | null;
  ssh_key: string | null;
}

export interface StorageScan {
  id: number;
  host_ip: string;
  collected_at: string;
  hostname: string | null;
  raw_json: string;
  created_at: string;
}

export const storageDb = {
  getHosts(): StorageHost[] {
    return db.prepare(`SELECT * FROM storage_hosts ORDER BY ip`).all() as StorageHost[];
  },

  getHost(ip: string): StorageHost | null {
    return db.prepare(`SELECT * FROM storage_hosts WHERE ip = ?`).get(ip) as StorageHost | null;
  },

  addHost(ip: string, port = 22, opts?: {
    label?: string;
    ssh_user?: string;
    ssh_auth_type?: string;
    ssh_pass?: string | null;
    ssh_key?: string | null;
  }): void {
    db.prepare(`
      INSERT OR IGNORE INTO storage_hosts (ip, port, label, ssh_user, ssh_auth_type, ssh_pass, ssh_key)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      ip,
      port,
      opts?.label ?? null,
      opts?.ssh_user ?? 'root',
      opts?.ssh_auth_type ?? 'password',
      opts?.ssh_pass ?? null,
      opts?.ssh_key ?? null,
    );
  },

  updateHostSsh(ip: string, config: {
    label?: string;
    ssh_user?: string;
    ssh_auth_type?: string;
    ssh_pass?: string | null;
    ssh_key?: string | null;
  }): void {
    const current = db.prepare(`SELECT * FROM storage_hosts WHERE ip = ?`).get(ip) as StorageHost | null;
    if (!current) return;
    db.prepare(`
      UPDATE storage_hosts SET
        label = COALESCE(?, label),
        ssh_user = ?,
        ssh_auth_type = ?,
        ssh_pass = ?,
        ssh_key = ?
      WHERE ip = ?
    `).run(
      config.label !== undefined ? config.label : null,
      config.ssh_user ?? current.ssh_user ?? 'root',
      config.ssh_auth_type ?? current.ssh_auth_type ?? 'password',
      (config.ssh_pass !== undefined && config.ssh_pass !== '') ? config.ssh_pass : current.ssh_pass,
      (config.ssh_key !== undefined && config.ssh_key !== '') ? config.ssh_key : current.ssh_key,
      ip,
    );
  },

  removeHost(ip: string): void {
    db.prepare(`DELETE FROM storage_hosts WHERE ip = ?`).run(ip);
    db.prepare(`DELETE FROM storage_scans WHERE host_ip = ?`).run(ip);
  },

  updateHostStatus(ip: string, status: string, hostname: string | null = null, error: string | null = null): void {
    db.prepare(
      `UPDATE storage_hosts SET last_scan_at = datetime('now'), last_scan_status = ?,
       hostname = COALESCE(?, hostname), last_error = ? WHERE ip = ?`
    ).run(status, hostname, error, ip);
  },

  saveScan(hostIp: string, data: Record<string, unknown>): void {
    db.prepare(`
      INSERT INTO storage_scans (host_ip, collected_at, hostname, raw_json)
      VALUES (?, datetime('now'), ?, ?)
    `).run(hostIp, (data.hostname as string) ?? null, JSON.stringify(data));

    db.prepare(`
      DELETE FROM storage_scans WHERE host_ip = ? AND id NOT IN (
        SELECT id FROM storage_scans WHERE host_ip = ? ORDER BY id DESC LIMIT 48
      )
    `).run(hostIp, hostIp);
  },

  getLatestScan(hostIp: string): StorageScan | null {
    return db.prepare(
      `SELECT * FROM storage_scans WHERE host_ip = ? ORDER BY id DESC LIMIT 1`
    ).get(hostIp) as StorageScan | null;
  },

  getRecentScans(hostIp: string, limit = 24): StorageScan[] {
    return db.prepare(
      `SELECT id, host_ip, collected_at, hostname FROM storage_scans WHERE host_ip = ? ORDER BY id DESC LIMIT ?`
    ).all(hostIp, limit) as StorageScan[];
  },
};
