import express from 'express';
import multer from 'multer';
import { Client } from 'minio';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
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

const PORT = process.env.PORT || 3003;

// MinIO client
const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
});

const BUCKET_NAME = process.env.MINIO_BUCKET || 'faceauth-media';

// PostgreSQL connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'faceauth',
  user: process.env.DB_USER || 'faceauth',
  password: process.env.DB_PASSWORD || 'changeme',
});

// Initialize bucket
(async () => {
  try {
    const exists = await minioClient.bucketExists(BUCKET_NAME);
    if (!exists) {
      await minioClient.makeBucket(BUCKET_NAME, 'us-east-1');
      logger.info({ bucket: BUCKET_NAME }, 'Created bucket');
    }
  } catch (error) {
    logger.error({ error }, 'Error initializing bucket');
  }
})();

// Initialize database
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS media (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id VARCHAR(255) NOT NULL,
        storage_key VARCHAR(500) NOT NULL,
        content_type VARCHAR(100) NOT NULL,
        size BIGINT NOT NULL,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_media_owner ON media(owner_id);
      CREATE INDEX IF NOT EXISTS idx_media_expires ON media(expires_at);
    `);
    logger.info('Database initialized');
  } catch (error) {
    logger.error({ error }, 'Error initializing database');
  }
})();

// Multer configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

// POST /media/upload
app.post('/media/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { owner_id } = z.object({ owner_id: z.string() }).parse(req.body);
    const file = req.file;

    const mediaId = uuidv4();
    const storageKey = `${owner_id}/${mediaId}/${file.originalname}`;
    
    // Upload to MinIO
    await minioClient.putObject(BUCKET_NAME, storageKey, file.buffer, file.size, {
      'Content-Type': file.mimetype,
    });

    // Calculate expiration (24 hours default)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Store metadata in database
    await pool.query(
      `INSERT INTO media (id, owner_id, storage_key, content_type, size, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [mediaId, owner_id, storageKey, file.mimetype, file.size, expiresAt]
    );

    logger.info({ mediaId, owner_id, storageKey }, 'File uploaded');

    res.json({
      mediaId,
      url: `/media/${mediaId}`,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    logger.error({ error }, 'Error uploading file');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /media/:id
app.get('/media/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM media WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const media = result.rows[0];

    // Check expiration
    if (media.expires_at && new Date(media.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Media expired' });
    }

    // Generate presigned URL (valid for 1 hour)
    const url = await minioClient.presignedGetObject(BUCKET_NAME, media.storage_key, 3600);

    res.json({
      mediaId: media.id,
      url,
      contentType: media.content_type,
      size: media.size,
      expiresAt: media.expires_at,
    });
  } catch (error) {
    logger.error({ error }, 'Error retrieving media');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /media/:id
app.delete('/media/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT storage_key FROM media WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const storageKey = result.rows[0].storage_key;

    // Delete from MinIO
    await minioClient.removeObject(BUCKET_NAME, storageKey);

    // Delete from database
    await pool.query('DELETE FROM media WHERE id = $1', [id]);

    logger.info({ mediaId: id }, 'Media deleted');

    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Error deleting media');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cleanup expired media (should run as cron job)
app.post('/media/cleanup', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, storage_key FROM media WHERE expires_at < NOW()'
    );

    for (const media of result.rows) {
      try {
        await minioClient.removeObject(BUCKET_NAME, media.storage_key);
        await pool.query('DELETE FROM media WHERE id = $1', [media.id]);
        logger.info({ mediaId: media.id }, 'Cleaned up expired media');
      } catch (error) {
        logger.error({ error, mediaId: media.id }, 'Error cleaning up media');
      }
    }

    res.json({ cleaned: result.rows.length });
  } catch (error) {
    logger.error({ error }, 'Error in cleanup');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    const exists = await minioClient.bucketExists(BUCKET_NAME);
    res.json({ 
      status: 'ok', 
      service: 'media-service',
      database: 'connected',
      storage: exists ? 'connected' : 'disconnected',
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      service: 'media-service',
      error: (error as Error).message,
    });
  }
});

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Media Service started');
});

