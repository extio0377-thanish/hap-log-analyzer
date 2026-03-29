import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../lib/db.js';
import { createToken, requireAuth, type AuthUser } from '../lib/auth-middleware.js';

const router = Router();

router.post('/auth/login', (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const user = db.prepare(`
    SELECT u.id, u.full_name, u.email, u.password_hash, u.role_id, u.color_theme,
           r.name AS role_name
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    WHERE u.email = ?
  `).get(email) as { id: number; full_name: string; email: string; password_hash: string; role_id: number; color_theme: string; role_name: string } | undefined;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const permissions = (db.prepare(`
    SELECT p.name FROM permissions p
    INNER JOIN role_permissions rp ON rp.permission_id = p.id
    WHERE rp.role_id = ?
  `).all(user.role_id) as { name: string }[]).map(p => p.name);

  const payload: AuthUser = {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role_name,
    roleId: user.role_id,
    permissions,
    colorTheme: user.color_theme,
  };

  res.json({ token: createToken(payload), user: payload });
});

router.get('/auth/me', requireAuth, (req, res) => {
  const user = db.prepare(`
    SELECT u.id, u.full_name, u.email, u.mobile, u.role_id, u.color_theme,
           r.name AS role_name
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    WHERE u.id = ?
  `).get(req.user!.id) as { id: number; full_name: string; email: string; mobile: string; role_id: number; color_theme: string; role_name: string } | undefined;

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const permissions = (db.prepare(`
    SELECT p.name FROM permissions p
    INNER JOIN role_permissions rp ON rp.permission_id = p.id
    WHERE rp.role_id = ?
  `).all(user.role_id) as { name: string }[]).map(p => p.name);

  res.json({
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    mobile: user.mobile,
    role: user.role_name,
    roleId: user.role_id,
    permissions,
    colorTheme: user.color_theme,
  });
});

export default router;
