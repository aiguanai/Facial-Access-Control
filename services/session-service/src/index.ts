import express from 'express';
import { V2 } from 'paseto';
import { Pool } from 'pg';
import { createClient } from 'redis';
import pino from 'pino';
import pinoHttp from 'pino-http';
import dotenv from 'dotenv';
import { z } from 'zod';
import crypto from 'crypto';

dotenv.config();

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const httpLogger = pinoHttp({ logger });

const app = express();
app.use(express.json());
app.use(httpLogger);

const PORT = process.env.PORT || 3009;

// Generate or load secret key
const SECRET_KEY = process.env.PASETO_SECRET_KEY || crypto.randomBytes(32).toString('hex');

// PostgreSQL connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'faceauth',
  user: process.env.DB_USER || 'faceauth',
  password: process.env.DB_PASSWORD || 'changeme',
});

// Redis connection
const redisClient = createClient({
  url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`,
});

redisClient.on('error', (err) => logger.error({ err }, 'Redis Client Error'));
redisClient.connect();

// Initialize database
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255) NOT NULL,
        device_id VARCHAR(255),
        token_id VARCHAR(255) UNIQUE NOT NULL,
        risk_score JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP NOT NULL,
        revoked_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
      
      CREATE TABLE IF NOT EXISTS revoked_tokens (
        token_id VARCHAR(255) PRIMARY KEY,
        revoked_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_revoked_expires ON revoked_tokens(expires_at);
    `);
    logger.info('Database initialized');
  } catch (error) {
    logger.error({ error }, 'Error initializing database');
  }
})();

// Schemas
const IssueTokenRequestSchema = z.object({
  userId: z.string(),
  sessionId: z.string(),
  scores: z.object({
    face: z.number().optional(),
    liveness: z.number().optional(),
    behaviour: z.number().optional(),
    risk: z.string().optional(),
  }).optional(),
  deviceId: z.string().optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
});

const VerifyTokenRequestSchema = z.object({
  token: z.string(),
});

const RevokeTokenRequestSchema = z.object({
  tokenId: z.string(),
});

// POST /session/issue
app.post('/session/issue', async (req, res) => {
  try {
    const { userId, sessionId, scores, deviceId, ipAddress, userAgent } = IssueTokenRequestSchema.parse(req.body);
    
    const tokenId = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiry
    
    // Create PASETO token
    const token = await V2.sign(
      {
        sub: userId,
        jti: tokenId,
        sessionId,
        scores: scores || {},
        deviceId,
        exp: expiresAt.toISOString(),
      },
      Buffer.from(SECRET_KEY, 'hex'),
      {
        expiresIn: '24h',
      }
    );
    
    // Store session in database
    await pool.query(
      `INSERT INTO sessions (user_id, device_id, token_id, risk_score, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, deviceId, tokenId, JSON.stringify(scores || {}), ipAddress, userAgent, expiresAt]
    );
    
    // Cache in Redis
    await redisClient.setEx(
      `session:${tokenId}`,
      86400, // 24 hours
      JSON.stringify({
        userId,
        deviceId,
        scores,
        expiresAt: expiresAt.toISOString(),
      })
    );
    
    logger.info({ userId, tokenId }, 'Token issued');
    
    res.json({
      token,
      tokenId,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    logger.error({ error }, 'Error issuing token');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /session/verify
app.post('/session/verify', async (req, res) => {
  try {
    const { token } = VerifyTokenRequestSchema.parse(req.body);
    
    // Verify PASETO token
    const payload = await V2.verify(token, Buffer.from(SECRET_KEY, 'hex'));
    
    // Check if token is revoked
    const revoked = await redisClient.get(`revoked:${payload.jti}`);
    if (revoked) {
      return res.status(401).json({ error: 'Token revoked' });
    }
    
    // Check database for revocation
    const dbCheck = await pool.query(
      'SELECT revoked_at FROM revoked_tokens WHERE token_id = $1',
      [payload.jti]
    );
    
    if (dbCheck.rows.length > 0 && dbCheck.rows[0].revoked_at) {
      return res.status(401).json({ error: 'Token revoked' });
    }
    
    // Check expiration
    if (payload.exp && new Date(payload.exp) < new Date()) {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    res.json({
      valid: true,
      payload,
    });
  } catch (error) {
    logger.error({ error }, 'Error verifying token');
    res.status(401).json({ error: 'Invalid token' });
  }
});

// POST /session/revoke
app.post('/session/revoke', async (req, res) => {
  try {
    const { tokenId } = RevokeTokenRequestSchema.parse(req.body);
    
    // Mark as revoked in database
    const session = await pool.query(
      'SELECT expires_at FROM sessions WHERE token_id = $1',
      [tokenId]
    );
    
    if (session.rows.length === 0) {
      return res.status(404).json({ error: 'Token not found' });
    }
    
    await pool.query(
      'UPDATE sessions SET revoked_at = NOW() WHERE token_id = $1',
      [tokenId]
    );
    
    await pool.query(
      'INSERT INTO revoked_tokens (token_id, expires_at) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [tokenId, session.rows[0].expires_at]
    );
    
    // Cache revocation
    const ttl = Math.max(0, Math.floor((new Date(session.rows[0].expires_at).getTime() - Date.now()) / 1000));
    if (ttl > 0) {
      await redisClient.setEx(`revoked:${tokenId}`, ttl, '1');
    }
    
    logger.info({ tokenId }, 'Token revoked');
    
    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    logger.error({ error }, 'Error revoking token');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    await redisClient.ping();
    res.json({ status: 'ok', service: 'session-service' });
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      service: 'session-service',
      error: (error as Error).message,
    });
  }
});

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Session Service started');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await redisClient.quit();
  await pool.end();
  process.exit(0);
});

