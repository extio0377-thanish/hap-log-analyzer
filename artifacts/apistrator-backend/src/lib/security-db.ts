import db from './db';
import path from 'node:path';
import fs from 'node:fs';

db.exec(`
  CREATE TABLE IF NOT EXISTS security_servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL UNIQUE,
    port INTEGER DEFAULT 7779,
    enabled INTEGER DEFAULT 1,
    last_scan_at TEXT,
    last_scan_status TEXT DEFAULT 'pending',
    last_error TEXT
  );

  CREATE TABLE IF NOT EXISTS security_ssh_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    ssh_user TEXT DEFAULT 'root',
    ssh_port INTEGER DEFAULT 7779,
    ssh_auth_type TEXT DEFAULT 'password',
    ssh_pass TEXT,
    ssh_key TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS security_scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_ip TEXT NOT NULL,
    collected_at TEXT NOT NULL,
    hostname TEXT,
    raw_data TEXT NOT NULL,
    active_sessions INTEGER DEFAULT 0,
    sudo_failed INTEGER DEFAULT 0,
    ssh_success INTEGER DEFAULT 0,
    ssh_failed INTEGER DEFAULT 0,
    account_lockouts INTEGER DEFAULT 0,
    selinux_mode TEXT,
    selinux_denials INTEGER DEFAULT 0,
    firewall_active INTEGER DEFAULT 0,
    auditd_active INTEGER DEFAULT 0,
    failed_services INTEGER DEFAULT 0,
    kernel_version TEXT,
    os_release TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_sec_scans_server ON security_scans(server_ip, created_at DESC);
`);

// Safe migrations — ALTER TABLE ignores errors if column already exists
for (const col of [
  `ALTER TABLE security_ssh_config ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))`,
]) {
  try { db.exec(col); } catch {}
}

// Seed default servers
const defaultServers = ['10.0.1.10', '10.0.1.20', '10.0.1.30'];
for (const ip of defaultServers) {
  db.prepare(`INSERT OR IGNORE INTO security_servers (ip, port) VALUES (?, 7779)`).run(ip);
}

// Seed default SSH config
db.prepare(`INSERT OR IGNORE INTO security_ssh_config (id, ssh_user, ssh_port, ssh_auth_type) VALUES (1, 'root', 7779, 'password')`).run();

export interface SecurityServer {
  id: number;
  ip: string;
  port: number;
  enabled: number;
  last_scan_at: string | null;
  last_scan_status: string;
  last_error: string | null;
}

export interface SecurityScan {
  id: number;
  server_ip: string;
  collected_at: string;
  hostname: string | null;
  raw_data: string;
  active_sessions: number;
  sudo_failed: number;
  ssh_success: number;
  ssh_failed: number;
  account_lockouts: number;
  selinux_mode: string | null;
  selinux_denials: number;
  firewall_active: number;
  auditd_active: number;
  failed_services: number;
  kernel_version: string | null;
  os_release: string | null;
  created_at: string;
}

export interface SshConfig {
  id: number;
  ssh_user: string;
  ssh_port: number;
  ssh_auth_type: string;
  ssh_pass: string | null;
  ssh_key: string | null;
  updated_at: string;
}

export const securityDb = {
  getServers(): SecurityServer[] {
    return db.prepare(`SELECT * FROM security_servers ORDER BY ip`).all() as SecurityServer[];
  },

  getServer(ip: string): SecurityServer | null {
    return db.prepare(`SELECT * FROM security_servers WHERE ip = ?`).get(ip) as SecurityServer | null;
  },

  addServer(ip: string, port = 7779): void {
    db.prepare(`INSERT OR IGNORE INTO security_servers (ip, port) VALUES (?, ?)`).run(ip, port);
  },

  removeServer(ip: string): void {
    db.prepare(`DELETE FROM security_servers WHERE ip = ?`).run(ip);
  },

  updateServerStatus(ip: string, status: string, error: string | null = null): void {
    db.prepare(
      `UPDATE security_servers SET last_scan_at = datetime('now'), last_scan_status = ?, last_error = ? WHERE ip = ?`
    ).run(status, error, ip);
  },

  saveScan(serverIp: string, data: Record<string, unknown>): void {
    const summary = (data.summary ?? {}) as Record<string, unknown>;
    const infra = (data.infra_changes ?? {}) as Record<string, unknown>;
    const sec = (data.security_events ?? {}) as Record<string, unknown>;

    db.prepare(`
      INSERT INTO security_scans
        (server_ip, collected_at, hostname, raw_data,
         active_sessions, sudo_failed, ssh_success, ssh_failed,
         account_lockouts, selinux_mode, selinux_denials,
         firewall_active, auditd_active, failed_services,
         kernel_version, os_release)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      serverIp,
      (data.collected_at as string) ?? new Date().toISOString(),
      (data.hostname as string) ?? null,
      JSON.stringify(data),
      Number(summary.active_sessions ?? 0),
      Number(summary.sudo_failed ?? 0),
      Number(summary.ssh_success ?? 0),
      Number(summary.ssh_failed ?? 0),
      Number(summary.account_lockouts ?? 0),
      (summary.selinux_mode as string) ?? null,
      Number(summary.selinux_denials ?? 0),
      (summary.firewall_active ? 1 : 0),
      (summary.auditd_active ? 1 : 0),
      Number(summary.failed_services ?? 0),
      (infra.kernel_version as string) ?? null,
      (infra.os_release as string) ?? null,
    );

    // Keep only last 60 scans per server (1 hour at 1-min intervals)
    db.prepare(`
      DELETE FROM security_scans WHERE server_ip = ? AND id NOT IN (
        SELECT id FROM security_scans WHERE server_ip = ? ORDER BY id DESC LIMIT 60
      )
    `).run(serverIp, serverIp);
  },

  getLatestScan(serverIp: string): SecurityScan | null {
    return db.prepare(
      `SELECT * FROM security_scans WHERE server_ip = ? ORDER BY id DESC LIMIT 1`
    ).get(serverIp) as SecurityScan | null;
  },

  getRecentScans(serverIp: string, limit = 30): SecurityScan[] {
    return db.prepare(
      `SELECT id, server_ip, collected_at, hostname, active_sessions, sudo_failed,
              ssh_success, ssh_failed, account_lockouts, selinux_mode, selinux_denials,
              firewall_active, auditd_active, failed_services, kernel_version, os_release, created_at
       FROM security_scans WHERE server_ip = ? ORDER BY id DESC LIMIT ?`
    ).all(serverIp, limit) as SecurityScan[];
  },

  getSshConfig(): SshConfig {
    return db.prepare(`SELECT * FROM security_ssh_config WHERE id = 1`).get() as SshConfig;
  },

  updateSshConfig(config: Partial<SshConfig>): void {
    const current = db.prepare(`SELECT * FROM security_ssh_config WHERE id = 1`).get() as SshConfig;
    db.prepare(`
      UPDATE security_ssh_config SET
        ssh_user = ?, ssh_port = ?, ssh_auth_type = ?, ssh_pass = ?, ssh_key = ?,
        updated_at = datetime('now')
      WHERE id = 1
    `).run(
      config.ssh_user ?? current.ssh_user,
      config.ssh_port ?? current.ssh_port,
      config.ssh_auth_type ?? current.ssh_auth_type,
      (config.ssh_pass !== undefined && config.ssh_pass !== '') ? config.ssh_pass : current.ssh_pass,
      (config.ssh_key !== undefined && config.ssh_key !== '') ? config.ssh_key : current.ssh_key,
    );
  },
};
