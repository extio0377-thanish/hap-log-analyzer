import { Router } from 'express';

const router = Router();

router.get('/app-config', (_req, res) => {
  res.json({
    defaultLogPath: process.env.DEFAULT_LOG_PATH || '/var/log/extio-engine.log',
    appName: 'Extio APISTRATOR',
  });
});

export default router;
