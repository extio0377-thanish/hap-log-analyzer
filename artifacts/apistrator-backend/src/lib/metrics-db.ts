import db from './db';

db.exec(`
  CREATE TABLE IF NOT EXISTS metrics_servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL UNIQUE,
    port INTEGER DEFAULT 22,
    enabled INTEGER DEFAULT 1,
    hostname TEXT,
    last_scan_at TEXT,
    last_scan_status TEXT DEFAULT 'pending',
    last_error TEXT
  );

  CREATE TABLE IF NOT EXISTS metrics_scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_ip TEXT NOT NULL,
    collected_at TEXT NOT NULL,
    hostname TEXT,
    cpu_usage REAL DEFAULT 0,
    mem_usage REAL DEFAULT 0,
    disk_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_metrics_scans_ip
    ON metrics_scans(server_ip, created_at DESC);
`);

export interface MetricsServer {
  id: number;
  ip: string;
  port: number;
  enabled: number;
  hostname: string | null;
  last_scan_at: string | null;
  last_scan_status: string;
  last_error: string | null;
}

export interface MetricsScan {
  id: number;
  server_ip: string;
  collected_at: string;
  hostname: string | null;
  cpu_usage: number;
  mem_usage: number;
  disk_json: string;
  created_at: string;
}

export const metricsDb = {
  getServers(): MetricsServer[] {
    return db.prepare(`SELECT * FROM metrics_servers ORDER BY ip`).all() as MetricsServer[];
  },

  getServer(ip: string): MetricsServer | null {
    return db.prepare(`SELECT * FROM metrics_servers WHERE ip = ?`).get(ip) as MetricsServer | null;
  },

  addServer(ip: string, port = 22): void {
    db.prepare(`INSERT OR IGNORE INTO metrics_servers (ip, port) VALUES (?, ?)`).run(ip, port);
  },

  removeServer(ip: string): void {
    db.prepare(`DELETE FROM metrics_servers WHERE ip = ?`).run(ip);
    db.prepare(`DELETE FROM metrics_scans WHERE server_ip = ?`).run(ip);
  },

  updateServerStatus(ip: string, status: string, hostname: string | null = null, error: string | null = null): void {
    db.prepare(
      `UPDATE metrics_servers SET last_scan_at = datetime('now'), last_scan_status = ?,
       hostname = COALESCE(?, hostname), last_error = ? WHERE ip = ?`
    ).run(status, hostname, error, ip);
  },

  saveScan(serverIp: string, cpu: number, mem: number, disks: unknown[], hostname: string | null): void {
    db.prepare(`
      INSERT INTO metrics_scans (server_ip, collected_at, hostname, cpu_usage, mem_usage, disk_json)
      VALUES (?, datetime('now'), ?, ?, ?, ?)
    `).run(serverIp, hostname, cpu, mem, JSON.stringify(disks));

    db.prepare(`
      DELETE FROM metrics_scans WHERE server_ip = ? AND id NOT IN (
        SELECT id FROM metrics_scans WHERE server_ip = ? ORDER BY id DESC LIMIT 120
      )
    `).run(serverIp, serverIp);
  },

  getLatestScan(serverIp: string): MetricsScan | null {
    return db.prepare(
      `SELECT * FROM metrics_scans WHERE server_ip = ? ORDER BY id DESC LIMIT 1`
    ).get(serverIp) as MetricsScan | null;
  },

  getRecentScans(serverIp: string, limit = 60): MetricsScan[] {
    return db.prepare(
      `SELECT * FROM metrics_scans WHERE server_ip = ? ORDER BY id DESC LIMIT ?`
    ).all(serverIp, limit) as MetricsScan[];
  },

  getLatestForAll(): { server: MetricsServer; scan: MetricsScan | null }[] {
    const servers = this.getServers();
    return servers.map(server => ({
      server,
      scan: this.getLatestScan(server.ip),
    }));
  },
};
