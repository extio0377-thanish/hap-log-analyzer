import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../lib/db.js';
import { createToken, type AuthUser } from '../lib/auth-middleware.js';
import { validatePassword } from '../lib/password-validator.js';
import type { PasswordPolicy } from '../lib/password-validator.js';

const router = Router();

router.get('/', (req, res) => {
  const user = db.prepare(`
    SELECT u.id, u.full_name, u.email, u.mobile, u.role_id, u.color_theme,
           r.name AS role_name
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    WHERE u.id = ?
  `).get(req.user!.id) as {
    id: number; full_name: string; email: string; mobile: string;
    role_id: number; color_theme: string; role_name: string;
  } | undefined;

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ ...user, fullName: user.full_name, role: user.role_name, colorTheme: user.color_theme });
});

router.put('/', (req, res) => {
  const { full_name, mobile } = req.body as { full_name?: string; mobile?: string };
  const id = req.user!.id;

  if (full_name) db.prepare(`UPDATE users SET full_name = ?, updated_at = datetime('now') WHERE id = ?`).run(full_name, id);
  if (mobile !== undefined) db.prepare(`UPDATE users SET mobile = ?, updated_at = datetime('now') WHERE id = ?`).run(mobile, id);

  res.json({ ok: true });
});

router.put('/theme', (req, res) => {
  const { color_theme } = req.body as { color_theme?: string };
  const allowed = ['red', 'blue', 'green', 'orange', 'pink', 'default'];
  if (!color_theme || !allowed.includes(color_theme)) {
    res.status(400).json({ error: 'Invalid color theme' });
    return;
  }
  const id = req.user!.id;
  db.prepare(`UPDATE users SET color_theme = ?, updated_at = datetime('now') WHERE id = ?`).run(color_theme, id);

  const fullUser = db.prepare(`
    SELECT u.id, u.full_name, u.email, u.mobile, u.role_id, u.color_theme, r.name AS role_name
    FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?
  `).get(id) as { id: number; full_name: string; email: string; mobile: string; role_id: number; color_theme: string; role_name: string };

  const permissions = (db.prepare(`
    SELECT p.name FROM permissions p
    INNER JOIN role_permissions rp ON rp.permission_id = p.id
    WHERE rp.role_id = ?
  `).all(fullUser.role_id) as { name: string }[]).map(p => p.name);

  const newPayload: AuthUser = {
    id: fullUser.id,
    email: fullUser.email,
    fullName: fullUser.full_name,
    role: fullUser.role_name,
    roleId: fullUser.role_id,
    permissions,
    colorTheme: fullUser.color_theme,
  };

  res.json({ ok: true, token: createToken(newPayload), user: newPayload });
});

router.put('/password', (req, res) => {
  const { current_password, new_password } = req.body as { current_password?: string; new_password?: string };
  if (!current_password || !new_password) {
    res.status(400).json({ error: 'current_password and new_password are required' });
    return;
  }

  const user = db.prepare(`SELECT password_hash FROM users WHERE id = ?`).get(req.user!.id) as { password_hash: string } | undefined;
  if (!user || !bcrypt.compareSync(current_password, user.password_hash)) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }

  const policy = db.prepare(`SELECT * FROM password_policy WHERE id = 1`).get() as PasswordPolicy;
  const { valid, errors } = validatePassword(new_password, policy);
  if (!valid) {
    res.status(422).json({ error: 'Password does not meet policy requirements', details: errors });
    return;
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(hash, req.user!.id);
  res.json({ ok: true });
});

export default router;
