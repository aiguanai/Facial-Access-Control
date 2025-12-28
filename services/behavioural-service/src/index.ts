import express from 'express';
import { Pool } from 'pg';
import { createClient } from 'redis';
import pino from 'pino';
import pinoHttp from 'pino-http';
import dotenv from 'dotenv';
import { z } from 'zod';
import { Matrix } from 'ml-matrix';

dotenv.config();

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const httpLogger = pinoHttp({ logger });

const app = express();
app.use(express.json());
app.use(httpLogger);

const PORT = process.env.PORT || 3006;

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
      CREATE TABLE IF NOT EXISTS behavioural_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255) NOT NULL,
        keystroke_features JSONB NOT NULL,
        mouse_features JSONB NOT NULL,
        device_fingerprint VARCHAR(500),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_behavioural_user ON behavioural_profiles(user_id);
    `);
    logger.info('Database initialized');
  } catch (error) {
    logger.error({ error }, 'Error initializing database');
  }
})();

// Schemas
const BehaviouralDataSchema = z.object({
  keystrokeTimings: z.array(z.number()),
  mouseMovements: z.array(z.object({
    x: z.number(),
    y: z.number(),
    timestamp: z.number(),
  })),
  deviceFingerprint: z.string(),
});

const EnrollRequestSchema = z.object({
  userId: z.string(),
  behaviouralData: BehaviouralDataSchema,
});

const ScoreRequestSchema = z.object({
  userId: z.string(),
  behaviouralData: BehaviouralDataSchema,
});

// Feature extraction functions
function extractKeystrokeFeatures(timings: number[]): number[] {
  if (timings.length < 2) return [0, 0, 0, 0];
  
  const intervals = [];
  for (let i = 1; i < timings.length; i++) {
    intervals.push(timings[i] - timings[i - 1]);
  }
  
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / intervals.length;
  const stdDev = Math.sqrt(variance);
  const min = Math.min(...intervals);
  const max = Math.max(...intervals);
  
  return [mean, stdDev, min, max];
}

function extractMouseFeatures(movements: Array<{ x: number; y: number; timestamp: number }>): number[] {
  if (movements.length < 2) return [0, 0, 0, 0, 0];
  
  const velocities = [];
  const accelerations = [];
  const distances = [];
  
  for (let i = 1; i < movements.length; i++) {
    const prev = movements[i - 1];
    const curr = movements[i];
    
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const dt = (curr.timestamp - prev.timestamp) / 1000; // Convert to seconds
    
    const distance = Math.sqrt(dx * dx + dy * dy);
    const velocity = dt > 0 ? distance / dt : 0;
    
    distances.push(distance);
    velocities.push(velocity);
    
    if (i > 1) {
      const prevVel = velocities[velocities.length - 2];
      const acceleration = dt > 0 ? (velocity - prevVel) / dt : 0;
      accelerations.push(acceleration);
    }
  }
  
  const velMean = velocities.reduce((a, b) => a + b, 0) / velocities.length;
  const velVar = velocities.reduce((sum, val) => sum + Math.pow(val - velMean, 2), 0) / velocities.length;
  const accMean = accelerations.length > 0 
    ? accelerations.reduce((a, b) => a + b, 0) / accelerations.length 
    : 0;
  const distMean = distances.reduce((a, b) => a + b, 0) / distances.length;
  const pathEfficiency = distances.length > 0 
    ? distances[0] / distances.reduce((a, b) => a + b, 0) 
    : 0;
  
  return [velMean, Math.sqrt(velVar), accMean, distMean, pathEfficiency];
}

// One-class SVM-like scoring (simplified)
function calculateTrustScore(
  currentFeatures: number[],
  enrolledFeatures: number[]
): number {
  if (enrolledFeatures.length !== currentFeatures.length) {
    return 0.0;
  }
  
  // Calculate cosine similarity
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < currentFeatures.length; i++) {
    dotProduct += currentFeatures[i] * enrolledFeatures[i];
    normA += currentFeatures[i] * currentFeatures[i];
    normB += enrolledFeatures[i] * enrolledFeatures[i];
  }
  
  const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
  
  // Convert to trust score (0-1)
  return Math.max(0, Math.min(1, (similarity + 1) / 2));
}

// POST /behaviour/enroll
app.post('/behaviour/enroll', async (req, res) => {
  try {
    const { userId, behaviouralData } = EnrollRequestSchema.parse(req.body);
    
    const keystrokeFeatures = extractKeystrokeFeatures(behaviouralData.keystrokeTimings);
    const mouseFeatures = extractMouseFeatures(behaviouralData.mouseMovements);
    
    const allFeatures = [...keystrokeFeatures, ...mouseFeatures];
    
    await pool.query(`
      INSERT INTO behavioural_profiles (user_id, keystroke_features, mouse_features, device_fingerprint)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        keystroke_features = EXCLUDED.keystroke_features,
        mouse_features = EXCLUDED.mouse_features,
        device_fingerprint = EXCLUDED.device_fingerprint,
        updated_at = NOW()
    `, [
      userId,
      JSON.stringify(keystrokeFeatures),
      JSON.stringify(mouseFeatures),
      behaviouralData.deviceFingerprint,
    ]);
    
    // Cache in Redis
    await redisClient.setEx(
      `behavioural:${userId}`,
      3600,
      JSON.stringify(allFeatures)
    );
    
    logger.info({ userId }, 'Behavioural profile enrolled');
    
    res.json({ success: true, userId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    logger.error({ error }, 'Error enrolling behavioural profile');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /behaviour/score
app.post('/behaviour/score', async (req, res) => {
  try {
    const { userId, behaviouralData } = ScoreRequestSchema.parse(req.body);
    
    // Try Redis cache first
    let cachedFeatures: number[] | null = null;
    try {
      const cached = await redisClient.get(`behavioural:${userId}`);
      if (cached) {
        cachedFeatures = JSON.parse(cached);
      }
    } catch (error) {
      logger.warn({ error }, 'Error reading from cache');
    }
    
    // If not in cache, get from database
    let enrolledFeatures: number[] | null = null;
    if (!cachedFeatures) {
      const result = await pool.query(
        'SELECT keystroke_features, mouse_features FROM behavioural_profiles WHERE user_id = $1',
        [userId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not enrolled' });
      }
      
      const keystrokeFeatures = result.rows[0].keystroke_features;
      const mouseFeatures = result.rows[0].mouse_features;
      enrolledFeatures = [...keystrokeFeatures, ...mouseFeatures];
      
      // Cache it
      await redisClient.setEx(
        `behavioural:${userId}`,
        3600,
        JSON.stringify(enrolledFeatures)
      );
    } else {
      enrolledFeatures = cachedFeatures;
    }
    
    // Extract current features
    const currentKeystrokeFeatures = extractKeystrokeFeatures(behaviouralData.keystrokeTimings);
    const currentMouseFeatures = extractMouseFeatures(behaviouralData.mouseMovements);
    const currentFeatures = [...currentKeystrokeFeatures, ...currentMouseFeatures];
    
    // Calculate trust score
    const trustScore = calculateTrustScore(currentFeatures, enrolledFeatures!);
    
    // Device fingerprint check
    const deviceMatch = behaviouralData.deviceFingerprint === 
      (await pool.query(
        'SELECT device_fingerprint FROM behavioural_profiles WHERE user_id = $1',
        [userId]
      )).rows[0]?.device_fingerprint;
    
    logger.info({ userId, trustScore, deviceMatch }, 'Behavioural score calculated');
    
    res.json({
      trustScore,
      deviceMatch,
      passed: trustScore >= 0.7 && deviceMatch,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    logger.error({ error }, 'Error calculating behavioural score');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    await redisClient.ping();
    res.json({ status: 'ok', service: 'behavioural-service' });
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      service: 'behavioural-service',
      error: (error as Error).message,
    });
  }
});

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Behavioural Biometrics Service started');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await redisClient.quit();
  await pool.end();
  process.exit(0);
});

