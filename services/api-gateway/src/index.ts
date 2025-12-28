import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { Kafka } from 'kafkajs';
import dotenv from 'dotenv';

dotenv.config();

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const httpLogger = pinoHttp({ logger });

// Kafka client for audit logs
const kafka = new Kafka({
  clientId: 'api-gateway',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
});

const producer = kafka.producer();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Kafka producer with error handling
(async () => {
  try {
    await producer.connect();
    logger.info('Kafka producer connected');
  } catch (error) {
    logger.warn({ error }, 'Failed to connect to Kafka. API Gateway will continue without audit logging.');
  }
})();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3001'],
  credentials: true,
}));

// Logging
app.use(httpLogger);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Audit logging middleware
const auditLog = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const startTime = Date.now();
  
  res.on('finish', async () => {
    const duration = Date.now() - startTime;
    try {
      await producer.send({
        topic: 'audit.events',
        messages: [{
          key: req.ip,
          value: JSON.stringify({
            timestamp: new Date().toISOString(),
            method: req.method,
            path: req.path,
            ip: req.ip,
            userAgent: req.get('user-agent'),
            statusCode: res.statusCode,
            duration,
            userId: (req as any).userId || null,
          }),
        }],
      });
    } catch (error) {
      logger.error({ error }, 'Failed to send audit log');
    }
  });
  
  next();
};

app.use(auditLog);

// Service routing configuration
const services = {
  '/auth': process.env.AUTH_ORCHESTRATION_URL || 'http://localhost:3001',
  '/enrollment': process.env.PROFILE_SERVICE_URL || 'http://localhost:3002',
  '/media': process.env.MEDIA_SERVICE_URL || 'http://localhost:3003',
  '/face': process.env.FACE_MATCHING_URL || 'http://localhost:3004',
  '/liveness': process.env.LIVENESS_SERVICE_URL || 'http://localhost:3005',
  '/behaviour': process.env.BEHAVIOURAL_SERVICE_URL || 'http://localhost:3006',
  '/risk': process.env.RISK_ENGINE_URL || 'http://localhost:3007',
  '/otp': process.env.MFA_SERVICE_URL || 'http://localhost:3008',
  '/session': process.env.SESSION_SERVICE_URL || 'http://localhost:3009',
  '/admin': process.env.ADMIN_CONSOLE_URL || 'http://localhost:3010',
  '/audit': process.env.AUDIT_SERVICE_URL || 'http://localhost:3011',
  '/models': process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3012',
};

// Create proxy middleware for each service
Object.entries(services).forEach(([path, target]) => {
  app.use(
    `/api${path}`,
    createProxyMiddleware({
      target,
      changeOrigin: true,
      pathRewrite: {
        [`^/api${path}`]: path === '/auth' ? '/auth' : '',
      },
      onError: (err, req, res) => {
        logger.error({ err, path, target }, 'Proxy error');
        res.status(502).json({ error: 'Service unavailable' });
      },
      onProxyReq: (proxyReq, req) => {
        // Forward original IP
        proxyReq.setHeader('X-Forwarded-For', req.ip);
        proxyReq.setHeader('X-Real-IP', req.ip);
      },
    })
  );
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-gateway' });
});

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err, req: { path: req.path, method: req.method } }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'API Gateway started');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await producer.disconnect();
  process.exit(0);
});


