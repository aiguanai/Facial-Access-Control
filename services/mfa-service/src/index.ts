import express from 'express';
import { createClient } from 'redis';
import nodemailer from 'nodemailer';
import twilio from 'twilio';
import { authenticator } from 'otplib';
import crypto from 'crypto';
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

const PORT = process.env.PORT || 3008;

// Redis connection
const redisClient = createClient({
  url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`,
});

redisClient.on('error', (err) => logger.error({ err }, 'Redis Client Error'));
redisClient.connect();

// Email transporter
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Twilio client (optional)
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

// Schemas
const SendOTPRequestSchema = z.object({
  userId: z.string(),
  sessionId: z.string(),
  method: z.enum(['email', 'sms', 'whatsapp']),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

const VerifyOTPRequestSchema = z.object({
  sessionId: z.string(),
  otpCode: z.string(),
});

function generateOTP(): string {
  return crypto.randomInt(100000, 999999).toString();
}

async function sendEmailOTP(email: string, otp: string): Promise<void> {
  await emailTransporter.sendMail({
    from: process.env.SMTP_FROM || 'noreply@faceauth.com',
    to: email,
    subject: 'Your Authentication Code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Your Authentication Code</h2>
        <p>Your one-time password (OTP) is:</p>
        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
          ${otp}
        </div>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn't request this code, please ignore this email.</p>
      </div>
    `,
  });
}

async function sendSMSOTP(phone: string, otp: string): Promise<void> {
  if (!twilioClient) {
    throw new Error('Twilio not configured');
  }
  
  await twilioClient.messages.create({
    body: `Your authentication code is: ${otp}. Valid for 10 minutes.`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: phone,
  });
}

// POST /otp/send
app.post('/otp/send', async (req, res) => {
  try {
    const { userId, sessionId, method, email, phone } = SendOTPRequestSchema.parse(req.body);
    
    const otp = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    
    // Store OTP in Redis
    await redisClient.setEx(
      `otp:${sessionId}`,
      600, // 10 minutes TTL
      JSON.stringify({
        otp,
        userId,
        method,
        createdAt: Date.now(),
        attempts: 0,
      })
    );
    
    // Send OTP based on method
    if (method === 'email' && email) {
      await sendEmailOTP(email, otp);
      logger.info({ userId, sessionId, method }, 'OTP sent via email');
    } else if ((method === 'sms' || method === 'whatsapp') && phone) {
      await sendSMSOTP(phone, otp);
      logger.info({ userId, sessionId, method }, 'OTP sent via SMS');
    } else {
      return res.status(400).json({ error: 'Missing email or phone for selected method' });
    }
    
    res.json({
      success: true,
      sessionId,
      method,
      expiresIn: 600, // seconds
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    logger.error({ error }, 'Error sending OTP');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /otp/verify
app.post('/otp/verify', async (req, res) => {
  try {
    const { sessionId, otpCode } = VerifyOTPRequestSchema.parse(req.body);
    
    const stored = await redisClient.get(`otp:${sessionId}`);
    
    if (!stored) {
      return res.status(404).json({ error: 'OTP not found or expired' });
    }
    
    const otpData = JSON.parse(stored);
    
    // Check attempts
    if (otpData.attempts >= 3) {
      await redisClient.del(`otp:${sessionId}`);
      return res.status(429).json({ error: 'Too many attempts' });
    }
    
    // Verify OTP
    const isValid = otpData.otp === otpCode;
    
    if (!isValid) {
      otpData.attempts += 1;
      await redisClient.setEx(
        `otp:${sessionId}`,
        600,
        JSON.stringify(otpData)
      );
      return res.status(401).json({ error: 'Invalid OTP', attempts: otpData.attempts });
    }
    
    // Delete OTP after successful verification
    await redisClient.del(`otp:${sessionId}`);
    
    logger.info({ sessionId }, 'OTP verified successfully');
    
    res.json({
      valid: true,
      sessionId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    logger.error({ error }, 'Error verifying OTP');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    await redisClient.ping();
    res.json({ status: 'ok', service: 'mfa-service' });
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      service: 'mfa-service',
      error: (error as Error).message,
    });
  }
});

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'MFA Service started');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await redisClient.quit();
  process.exit(0);
});

