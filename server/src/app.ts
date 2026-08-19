import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config';
import { healthcheck } from './db';
import { contentRouter } from './routes/content.routes';
import { adminRouter } from './routes/admin.routes';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(compression());
  app.use(express.json({ limit: '256kb' }));

  app.use(
    cors({
      origin(origin, callback) {
        // Non-browser clients (curl, server-to-server) send no Origin header.
        if (!origin || config.isOriginAllowed(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} is not allowed by CORS`));
        }
      },
    }),
  );

  app.get('/api/health', async (_req, res) => {
    const databaseUp = await healthcheck();
    res.status(databaseUp ? 200 : 503).json({
      status: databaseUp ? 'ok' : 'degraded',
      database: databaseUp,
      uptime: Math.round(process.uptime()),
    });
  });

  app.use('/api', contentRouter);
  app.use('/api/admin', adminRouter);

  app.use((req, res) => {
    res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
  });

  // Express identifies error handlers by arity, so `next` must stay.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err.message.includes('not allowed by CORS')) {
      res.status(403).json({ error: err.message });
      return;
    }
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({
      error: config.isProduction ? 'Internal server error' : err.message,
    });
  });

  return app;
}
