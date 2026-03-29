import { Router } from 'express';
import { db } from '../lib/db.js';
import { requirePermission } from '../lib/auth-middleware.js';

const router = Router();

router.get('/', (_req, res) => {
  const policy = db.prepare(`SELECT * FROM password_policy WHERE id = 1`).get();
  res.json(policy);
});

router.put('/', requirePermission('manage_policy'), (req, res) => {
  const { min_length, min_uppercase, min_lowercase, min_special } = req.body as {
    min_length?: number; min_uppercase?: number; min_lowercase?: number; min_special?: number;
  };

  if (
    min_length === undefined || min_uppercase === undefined ||
    min_lowercase === undefined || min_special === undefined
  ) {
    res.status(400).json({ error: 'All policy fields are required' });
    return;
  }

  if (min_length < 4 || min_length > 128) {
    res.status(422).json({ error: 'min_length must be between 4 and 128' });
    return;
  }

  db.prepare(`
    UPDATE password_policy
    SET min_length = ?, min_uppercase = ?, min_lowercase = ?, min_special = ?,
        updated_at = datetime('now')
    WHERE id = 1
  `).run(min_length, min_uppercase, min_lowercase, min_special);

  res.json({ ok: true });
});

export default router;
