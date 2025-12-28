import express from 'express';
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

const PORT = process.env.PORT || 3012;

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
      CREATE TABLE IF NOT EXISTS model_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        model_type VARCHAR(100) NOT NULL,
        version VARCHAR(50) NOT NULL,
        model_path TEXT NOT NULL,
        metrics JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        deployed_at TIMESTAMP,
        is_active BOOLEAN DEFAULT FALSE,
        UNIQUE(model_type, version)
      );
      CREATE INDEX IF NOT EXISTS idx_model_type ON model_versions(model_type);
      CREATE INDEX IF NOT EXISTS idx_model_active ON model_versions(is_active);
    `);
    logger.info('Database initialized');
  } catch (error) {
    logger.error({ error }, 'Error initializing database');
  }
})();

// Schemas
const DeployModelRequestSchema = z.object({
  modelType: z.enum(['behavioural', 'deepfake', 'liveness']),
  version: z.string(),
  modelPath: z.string(),
  metrics: z.record(z.any()).optional(),
});

// POST /models/deploy
app.post('/models/deploy', async (req, res) => {
  try {
    const { modelType, version, modelPath, metrics } = DeployModelRequestSchema.parse(req.body);
    
    // Deactivate previous versions
    await pool.query(
      'UPDATE model_versions SET is_active = FALSE WHERE model_type = $1',
      [modelType]
    );
    
    // Insert new version
    await pool.query(
      `INSERT INTO model_versions (model_type, version, model_path, metrics, deployed_at, is_active)
       VALUES ($1, $2, $3, $4, NOW(), TRUE)
       ON CONFLICT (model_type, version)
       DO UPDATE SET 
         model_path = EXCLUDED.model_path,
         metrics = EXCLUDED.metrics,
         deployed_at = NOW(),
         is_active = TRUE`,
      [modelType, version, modelPath, JSON.stringify(metrics || {})]
    );
    
    logger.info({ modelType, version }, 'Model deployed');
    
    res.json({
      success: true,
      modelType,
      version,
      deployedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    logger.error({ error }, 'Error deploying model');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /models/versions
app.get('/models/versions', async (req, res) => {
  try {
    const modelType = req.query.modelType as string | undefined;
    
    let sql = 'SELECT * FROM model_versions';
    const params: any[] = [];
    
    if (modelType) {
      sql += ' WHERE model_type = $1';
      params.push(modelType);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    const result = await pool.query(sql, params);
    
    res.json({
      models: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    logger.error({ error }, 'Error getting model versions');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /analytics/thresholds
app.get('/analytics/thresholds', async (req, res) => {
  try {
    // In production, this would analyze historical data and recommend thresholds
    // For now, return default recommendations
    res.json({
      recommendations: {
        face: {
          allow: 0.85,
          challenge: 0.70,
          deny: 0.0,
        },
        liveness: {
          allow: 0.85,
          challenge: 0.75,
          deny: 0.0,
        },
        behaviour: {
          allow: 0.80,
          challenge: 0.65,
          deny: 0.0,
        },
      },
      basedOn: 'default_policy',
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ error }, 'Error getting threshold recommendations');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'analytics-service' });
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      service: 'analytics-service',
      error: (error as Error).message,
    });
  }
});

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Analytics & Model Training Service started');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});

