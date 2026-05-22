
import express, { Request, Response, NextFunction } from 'express';
import routes from "./routes/index.js";

console.log("DATABASE_URL at startup:", process.env.DATABASE_URL);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.use('/api', routes);

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

interface AppError extends Error {
  statusCode?: number;
  details?: unknown;
}

app.use((err: AppError, req: Request, res: Response, next: NextFunction) => {
  const status = err.statusCode || 500;

  console.error({
    message: err.message,
    status,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    details: err.details
  });

  res.status(status).json({
    success: false,
    error: err.message || 'Internal server error',
    ...(err.details ? { details: err.details } : {})
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`
  );
});