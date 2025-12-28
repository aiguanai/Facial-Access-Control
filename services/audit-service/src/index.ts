import express from 'express';
import { Kafka } from 'kafkajs';
import { Pool } from 'pg';
import pino from 'pino';
import pinoHttp from 'pino-http';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const httpLogger = pinoHttp({ logger });

const app = express();
app.use(express.json());
app.use(httpLogger);

const PORT = process.env.PORT || 3011;

// Kafka consumer
const kafka = new Kafka({
  clientId: 'audit-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'audit-service-group' });

// PostgreSQL connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'faceauth',
  user: process.env.DB_USER || 'faceauth',
  password: process.env.DB_PASSWORD || 'changeme',
});

// Initialize database
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type VARCHAR(100) NOT NULL,
        user_id VARCHAR(255),
        session_id VARCHAR(255),
        ip_address VARCHAR(45),
        user_agent TEXT,
        event_data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_events(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_events(session_id);
      CREATE INDEX IF NOT EXISTS idx_audit_type ON audit_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at);
    `);
    logger.info('Database initialized');
  } catch (error) {
    logger.error({ error }, 'Error initializing database');
  }
})();

// Kafka consumer setup with retry logic
(async () => {
  const maxRetries = 10;
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      await consumer.connect();
      await consumer.subscribe({ topic: 'audit.events', fromBeginning: false });
      await consumer.subscribe({ topic: 'auth.attempts', fromBeginning: false });
      await consumer.subscribe({ topic: 'risk.decisions', fromBeginning: false });
      
      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const event = JSON.parse(message.value?.toString() || '{}');
            
            await pool.query(
              `INSERT INTO audit_events (event_type, user_id, session_id, ip_address, user_agent, event_data)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                topic,
                event.userId || null,
                event.sessionId || null,
                event.ip || null,
                event.userAgent || null,
                JSON.stringify(event),
              ]
            );
            
            logger.info({ topic, event }, 'Audit event stored');
          } catch (error) {
            logger.error({ error, topic }, 'Error processing audit event');
          }
        },
      });
      
      logger.info('Kafka consumer started');
      break;
    } catch (error) {
      retries++;
      if (retries >= maxRetries) {
        logger.warn({ error }, 'Failed to connect to Kafka after retries. Audit service will continue without Kafka.');
        break;
      }
      logger.warn({ error, retry: retries }, 'Kafka connection failed, retrying...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
})();

// Schemas
const GetEventsQuerySchema = z.object({
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  eventType: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.string().optional().transform(val => val ? parseInt(val) : 100),
  offset: z.string().optional().transform(val => val ? parseInt(val) : 0),
});

// GET /audit/events
app.get('/audit/events', async (req, res) => {
  try {
    const query = GetEventsQuerySchema.parse(req.query);
    
    let sql = 'SELECT * FROM audit_events WHERE 1=1';
    const params: any[] = [];
    let paramCount = 1;
    
    if (query.userId) {
      sql += ` AND user_id = $${paramCount++}`;
      params.push(query.userId);
    }
    
    if (query.sessionId) {
      sql += ` AND session_id = $${paramCount++}`;
      params.push(query.sessionId);
    }
    
    if (query.eventType) {
      sql += ` AND event_type = $${paramCount++}`;
      params.push(query.eventType);
    }
    
    if (query.startDate) {
      sql += ` AND created_at >= $${paramCount++}`;
      params.push(query.startDate);
    }
    
    if (query.endDate) {
      sql += ` AND created_at <= $${paramCount++}`;
      params.push(query.endDate);
    }
    
    sql += ` ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    params.push(query.limit, query.offset);
    
    const result = await pool.query(sql, params);
    
    res.json({
      events: result.rows,
      count: result.rows.length,
      limit: query.limit,
      offset: query.offset,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    logger.error({ error }, 'Error getting audit events');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /audit/user/:id
app.get('/audit/user/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    
    const result = await pool.query(
      'SELECT * FROM audit_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [id, limit]
    );
    
    res.json({
      userId: id,
      events: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    logger.error({ error }, 'Error getting user audit events');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'audit-service' });
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      service: 'audit-service',
      error: (error as Error).message,
    });
  }
});

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Audit & Compliance Service started');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await consumer.disconnect();
  await pool.end();
  process.exit(0);
});

