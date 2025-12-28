import express from 'express';
import { Pool } from 'pg';
import axios from 'axios';
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

const PORT = process.env.PORT || 3002;

// Service URLs
const FACE_SERVICE = process.env.FACE_MATCHING_URL || 'http://localhost:3004';
const BEHAVIOURAL_SERVICE = process.env.BEHAVIOURAL_SERVICE_URL || 'http://localhost:3006';
const MEDIA_SERVICE = process.env.MEDIA_SERVICE_URL || 'http://localhost:3003';

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
      CREATE TABLE IF NOT EXISTS enrollment_status (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255) UNIQUE NOT NULL,
        face_enrolled BOOLEAN DEFAULT FALSE,
        behavioural_enrolled BOOLEAN DEFAULT FALSE,
        face_enrolled_at TIMESTAMP,
        behavioural_enrolled_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_enrollment_user ON enrollment_status(user_id);
    `);
    logger.info('Database initialized');
  } catch (error) {
    logger.error({ error }, 'Error initializing database');
  }
})();

// Schemas
const FaceEnrollStartSchema = z.object({
  userId: z.string(),
});

const FaceEnrollCompleteSchema = z.object({
  userId: z.string(),
  mediaId: z.string(),
});

const BehaviourEnrollSchema = z.object({
  userId: z.string(),
  behaviouralData: z.object({
    keystrokeTimings: z.array(z.number()),
    mouseMovements: z.array(z.object({
      x: z.number(),
      y: z.number(),
      timestamp: z.number(),
    })),
    deviceFingerprint: z.string(),
  }),
});

// POST /enrollment/face/start
app.post('/enrollment/face/start', async (req, res) => {
  try {
    const { userId } = FaceEnrollStartSchema.parse(req.body);
    
    // Create or update enrollment status
    await pool.query(`
      INSERT INTO enrollment_status (user_id, face_enrolled)
      VALUES ($1, FALSE)
      ON CONFLICT (user_id) DO NOTHING
    `, [userId]);
    
    res.json({
      userId,
      step: 'capture_face',
      instructions: 'Please position your face in the camera and follow the prompts',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    logger.error({ error }, 'Error starting face enrollment');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /enrollment/face/complete
app.post('/enrollment/face/complete', async (req, res) => {
  try {
    const { userId, mediaId } = FaceEnrollCompleteSchema.parse(req.body);
    
    // Enroll face in face matching service
    await axios.post(`${FACE_SERVICE}/face/enroll`, {
      userId,
      mediaId,
    });
    
    // Update enrollment status
    await pool.query(`
      UPDATE enrollment_status
      SET face_enrolled = TRUE, face_enrolled_at = NOW(), updated_at = NOW()
      WHERE user_id = $1
    `, [userId]);
    
    logger.info({ userId }, 'Face enrollment completed');
    
    res.json({
      success: true,
      userId,
      faceEnrolled: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    logger.error({ error }, 'Error completing face enrollment');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /enrollment/behaviour/submit
app.post('/enrollment/behaviour/submit', async (req, res) => {
  try {
    const { userId, behaviouralData } = BehaviourEnrollSchema.parse(req.body);
    
    // Enroll behavioural profile
    await axios.post(`${BEHAVIOURAL_SERVICE}/behaviour/enroll`, {
      userId,
      behaviouralData,
    });
    
    // Update enrollment status
    await pool.query(`
      INSERT INTO enrollment_status (user_id, behavioural_enrolled, behavioural_enrolled_at)
      VALUES ($1, TRUE, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET 
        behavioural_enrolled = TRUE,
        behavioural_enrolled_at = NOW(),
        updated_at = NOW()
    `, [userId]);
    
    logger.info({ userId }, 'Behavioural enrollment completed');
    
    res.json({
      success: true,
      userId,
      behaviouralEnrolled: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    logger.error({ error }, 'Error submitting behavioural enrollment');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /enrollment/status
app.get('/enrollment/status', async (req, res) => {
  try {
    const { userId } = z.object({ userId: z.string() }).parse(req.query);
    
    const result = await pool.query(
      'SELECT * FROM enrollment_status WHERE user_id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.json({
        userId,
        faceEnrolled: false,
        behaviouralEnrolled: false,
      });
    }
    
    const status = result.rows[0];
    
    res.json({
      userId: status.user_id,
      faceEnrolled: status.face_enrolled,
      behaviouralEnrolled: status.behavioural_enrolled,
      faceEnrolledAt: status.face_enrolled_at,
      behaviouralEnrolledAt: status.behavioural_enrolled_at,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    logger.error({ error }, 'Error getting enrollment status');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'profile-service' });
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      service: 'profile-service',
      error: (error as Error).message,
    });
  }
});

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Profile & Enrollment Service started');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});

