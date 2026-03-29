import { Router } from 'express';
import { db } from '../lib/db.js';
import { requirePermission } from '../lib/auth-middleware.js';

const router = Router();

router.get('/', (_req, res) => {
  const roles = db.prepare(`
    SELECT r.id, r.name, r.description, r.created_at,
           GROUP_CONCAT(p.name) AS permission_names
    FROM roles r
    LEFT JOIN role_permissions rp ON rp.role_id = r.id
    LEFT JOIN permissions p ON p.id = rp.permission_id
    GROUP BY r.id
    ORDER BY r.id
  `).all() as { id: number; name: string; description: string; created_at: string; permission_names: string | null }[];

  const result = roles.map(r => ({
    ...r,
    permissions: r.permission_names ? r.permission_names.split(',') : [],
  }));

  res.json(result);
});

router.get('/permissions', (_req, res) => {
  const perms = db.prepare(`SELECT id, name, description FROM permissions ORDER BY name`).all();
  res.json(perms);
});

router.post('/', requirePermission('manage_roles'), (req, res) => {
  const { name, description, permissions } = req.body as {
    name?: string; description?: string; permissions?: number[];
  };
  if (!name) {
    res.status(400).json({ error: 'Role name is required' });
    return;
  }
  const existing = db.prepare(`SELECT id FROM roles WHERE name = ?`).get(name);
  if (existing) {
    res.status(409).json({ error: 'A role with that name already exists' });
    return;
  }
  const result = db.prepare(`INSERT INTO roles (name, description) VALUES (?, ?)`).run(name, description ?? '');
  const roleId = Number(result.lastInsertRowid);

  if (permissions?.length) {
    const insertPerm = db.prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`);
    for (const permId of permissions) {
      insertPerm.run(roleId, permId);
    }
  }

  res.status(201).json({ id: roleId });
});

router.put('/:id', requirePermission('manage_roles'), (req, res) => {
  const id = Number(req.params.id);
  const { name, description, permissions } = req.body as {
    name?: string; description?: string; permissions?: number[];
  };

  const existing = db.prepare(`SELECT id FROM roles WHERE id = ?`).get(id);
  if (!existing) {
    res.status(404).json({ error: 'Role not found' });
    return;
  }

  if (name) db.prepare(`UPDATE roles SET name = ? WHERE id = ?`).run(name, id);
  if (description !== undefined) db.prepare(`UPDATE roles SET description = ? WHERE id = ?`).run(description, id);

  if (permissions !== undefined) {
    db.prepare(`DELETE FROM role_permissions WHERE role_id = ?`).run(id);
    const insertPerm = db.prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`);
    for (const permId of permissions) {
      insertPerm.run(id, permId);
    }
  }

  res.json({ ok: true });
});

router.delete('/:id', requirePermission('manage_roles'), (req, res) => {
  const id = Number(req.params.id);
  const usersWithRole = db.prepare(`SELECT id FROM users WHERE role_id = ?`).get(id);
  if (usersWithRole) {
    res.status(400).json({ error: 'Cannot delete role that is assigned to users' });
    return;
  }
  const result = db.prepare(`DELETE FROM roles WHERE id = ?`).run(id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Role not found' });
    return;
  }
  res.json({ ok: true });
});

export default router;
