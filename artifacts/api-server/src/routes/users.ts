import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../lib/db.js';
import { requirePermission } from '../lib/auth-middleware.js';
import { validatePassword } from '../lib/password-validator.js';
import type { PasswordPolicy } from '../lib/password-validator.js';

const router = Router();

router.get('/', requirePermission('manage_users'), (_req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.full_name, u.email, u.mobile, u.role_id, u.color_theme,
           u.created_at, u.updated_at, r.name AS role_name
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    ORDER BY u.created_at DESC
  `).all();
  res.json(users);
});

router.post('/', requirePermission('manage_users'), (req, res) => {
  const { full_name, email, mobile, password, role_id } = req.body as {
    full_name?: string; email?: string; mobile?: string; password?: string; role_id?: number;
  };

  if (!full_name || !email || !password || !role_id) {
    res.status(400).json({ error: 'full_name, email, password, and role_id are required' });
    return;
  }

  const policy = db.prepare(`SELECT * FROM password_policy WHERE id = 1`).get() as PasswordPolicy;
  const { valid, errors } = validatePassword(password, policy);
  if (!valid) {
    res.status(422).json({ error: 'Password does not meet policy requirements', details: errors });
    return;
  }

  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
  if (existing) {
    res.status(409).json({ error: 'A user with that email already exists' });
    return;
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (full_name, email, mobile, password_hash, role_id, color_theme)
    VALUES (?, ?, ?, ?, ?, 'red')
  `).run(full_name, email, mobile ?? '', hash, role_id);

  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', requirePermission('manage_users'), (req, res) => {
  const id = Number(req.params.id);
  const { full_name, email, mobile, role_id, password } = req.body as {
    full_name?: string; email?: string; mobile?: string; role_id?: number; password?: string;
  };

  const existing = db.prepare(`SELECT id FROM users WHERE id = ?`).get(id);
  if (!existing) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if (password) {
    const policy = db.prepare(`SELECT * FROM password_policy WHERE id = 1`).get() as PasswordPolicy;
    const { valid, errors } = validatePassword(password, policy);
    if (!valid) {
      res.status(422).json({ error: 'Password does not meet policy requirements', details: errors });
      return;
    }
    const hash = bcrypt.hashSync(password, 10);
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(hash, id);
  }

  if (full_name) db.prepare(`UPDATE users SET full_name = ?, updated_at = datetime('now') WHERE id = ?`).run(full_name, id);
  if (email) db.prepare(`UPDATE users SET email = ?, updated_at = datetime('now') WHERE id = ?`).run(email, id);
  if (mobile !== undefined) db.prepare(`UPDATE users SET mobile = ?, updated_at = datetime('now') WHERE id = ?`).run(mobile, id);
  if (role_id) db.prepare(`UPDATE users SET role_id = ?, updated_at = datetime('now') WHERE id = ?`).run(role_id, id);

  res.json({ ok: true });
});

router.delete('/:id', requirePermission('manage_users'), (req, res) => {
  const id = Number(req.params.id);
  if (req.user?.id === id) {
    res.status(400).json({ error: 'You cannot delete your own account' });
    return;
  }
  const result = db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ ok: true });
});

export default router;
