import BetterSqlite3 from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'node:path';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'msb.db');

export const db = new BetterSqlite3(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    mobile TEXT DEFAULT '',
    password_hash TEXT NOT NULL,
    role_id INTEGER REFERENCES roles(id),
    color_theme TEXT DEFAULT 'red',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS password_policy (
    id INTEGER PRIMARY KEY DEFAULT 1,
    min_length INTEGER DEFAULT 8,
    min_uppercase INTEGER DEFAULT 1,
    min_lowercase INTEGER DEFAULT 1,
    min_special INTEGER DEFAULT 1,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

function seedDefaultData() {
  db.prepare(`INSERT OR IGNORE INTO roles (name, description) VALUES (?, ?)`).run('Admin', 'Full system access');
  db.prepare(`INSERT OR IGNORE INTO roles (name, description) VALUES (?, ?)`).run('Viewer', 'Read-only dashboard access');
  db.prepare(`INSERT OR IGNORE INTO roles (name, description) VALUES (?, ?)`).run('Operator', 'Can view dashboard and upload logs');

  const perms = [
    { name: 'view_dashboard', description: 'View the traffic dashboard' },
    { name: 'manage_users', description: 'Create, update, delete users' },
    { name: 'manage_roles', description: 'Create, update, delete roles' },
    { name: 'manage_policy', description: 'Manage password policy' },
    { name: 'view_metrics', description: 'View server metrics dashboard' },
    { name: 'manage_metrics', description: 'Add and remove metrics hosts' },
    { name: 'view_security', description: 'View security events dashboard' },
    { name: 'view_storage', description: 'View storage health dashboard' },
    { name: 'manage_storage', description: 'Add and remove storage hosts' },
  ];
  for (const p of perms) {
    db.prepare(`INSERT OR IGNORE INTO permissions (name, description) VALUES (?, ?)`).run(p.name, p.description);
  }

  const adminRole = db.prepare(`SELECT id FROM roles WHERE name = ?`).get('Admin') as { id: number };
  const viewerRole = db.prepare(`SELECT id FROM roles WHERE name = ?`).get('Viewer') as { id: number };
  const allPerms = db.prepare(`SELECT id FROM permissions`).all() as { id: number }[];
  for (const p of allPerms) {
    db.prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`).run(adminRole.id, p.id);
  }
  const viewPerm = db.prepare(`SELECT id FROM permissions WHERE name = ?`).get('view_dashboard') as { id: number };
  if (viewerRole && viewPerm) {
    db.prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`).run(viewerRole.id, viewPerm.id);
  }
  const viewMetricsPerm = db.prepare(`SELECT id FROM permissions WHERE name = ?`).get('view_metrics') as { id: number } | undefined;
  if (viewerRole && viewMetricsPerm) {
    db.prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`).run(viewerRole.id, viewMetricsPerm.id);
  }
  const viewSecPerm = db.prepare(`SELECT id FROM permissions WHERE name = ?`).get('view_security') as { id: number } | undefined;
  if (viewerRole && viewSecPerm) {
    db.prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`).run(viewerRole.id, viewSecPerm.id);
  }
  const viewStorPerm = db.prepare(`SELECT id FROM permissions WHERE name = ?`).get('view_storage') as { id: number } | undefined;
  if (viewerRole && viewStorPerm) {
    db.prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`).run(viewerRole.id, viewStorPerm.id);
  }

  db.prepare(`INSERT OR IGNORE INTO password_policy (id, min_length, min_uppercase, min_lowercase, min_special) VALUES (1, 8, 1, 1, 1)`).run();

  const existingAdmin = db.prepare(`SELECT id FROM users WHERE email = ?`).get('admin@msb.local');
  if (!existingAdmin) {
    const hash = bcrypt.hashSync('Admin@123!', 10);
    db.prepare(`INSERT INTO users (full_name, email, mobile, password_hash, role_id, color_theme) VALUES (?, ?, ?, ?, ?, ?)`).run(
      'Administrator', 'admin@msb.local', '', hash, adminRole.id, 'red'
    );
  }
}

seedDefaultData();

export default db;
