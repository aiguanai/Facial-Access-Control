import express from 'express';
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

const PORT = process.env.PORT || 3001;

// Service URLs
const FACE_SERVICE = process.env.FACE_MATCHING_URL || 'http://localhost:3004';
const LIVENESS_SERVICE = process.env.LIVENESS_SERVICE_URL || 'http://localhost:3005';
const BEHAVIOURAL_SERVICE = process.env.BEHAVIOURAL_SERVICE_URL || 'http://localhost:3006';
const RISK_ENGINE = process.env.RISK_ENGINE_URL || 'http://localhost:3007';
const MFA_SERVICE = process.env.MFA_SERVICE_URL || 'http://localhost:3008';
const SESSION_SERVICE = process.env.SESSION_SERVICE_URL || 'http://localhost:3009';
const MEDIA_SERVICE = process.env.MEDIA_SERVICE_URL || 'http://localhost:3003';

// Schemas
const LoginStartSchema = z.object({
  userId: z.string(),
  deviceId: z.string().optional(),
});

const LoginVerifySchema = z.object({
  sessionId: z.string(),
  mediaId: z.string(),
  challengeResponse: z.object({
    blinkDetected: z.boolean(),
    headTurnCompleted: z.boolean(),
    colorFlashResponse: z.string().optional(),
  }),
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

const OTPCompleteSchema = z.object({
  sessionId: z.string(),
  otpCode: z.string(),
});

interface AuthSession {
  sessionId: string;
  userId: string;
  state: 'face' | 'liveness' | 'behaviour' | 'risk' | 'mfa' | 'complete';
  scores: {
    face?: number;
    liveness?: number;
    behaviour?: number;
    risk?: string;
  };
  createdAt: Date;
}

const sessions = new Map<string, AuthSession>();

// POST /auth/login/start
app.post('/auth/login/start', async (req, res) => {
  try {
    const { userId, deviceId } = LoginStartSchema.parse(req.body);
    
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const session: AuthSession = {
      sessionId,
      userId,
      state: 'face',
      scores: {},
      createdAt: new Date(),
    };
    
    sessions.set(sessionId, session);
    
    // Generate challenge script
    const challengeScript = {
      type: 'random',
      challenges: [
        { type: 'blink', duration: 2000 },
        { type: 'headTurn', direction: Math.random() > 0.5 ? 'left' : 'right' },
        { type: 'colorFlash', color: ['red', 'green', 'blue'][Math.floor(Math.random() * 3)] },
      ],
    };
    
    res.json({
      sessionId,
      challengeScript,
      nextStep: 'capture_face',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    logger.error({ error }, 'Error in login/start');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/login/verify
app.post('/auth/login/verify', async (req, res) => {
  try {
    const { sessionId, mediaId, challengeResponse, behaviouralData } = LoginVerifySchema.parse(req.body);
    
    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Step 1: Face Matching
    logger.info({ sessionId }, 'Starting face matching');
    const faceResponse = await axios.post(`${FACE_SERVICE}/face/match`, {
      userId: session.userId,
      mediaId,
    });
    
    const faceScore = faceResponse.data.matchScore;
    session.scores.face = faceScore;
    session.state = 'liveness';
    
    if (faceScore < 0.7) {
      return res.json({
        sessionId,
        decision: 'DENY',
        reason: 'Face match score too low',
        scores: session.scores,
      });
    }
    
    // Step 2: Liveness Detection
    logger.info({ sessionId }, 'Starting liveness detection');
    const livenessResponse = await axios.post(`${LIVENESS_SERVICE}/liveness/verify`, {
      mediaId,
      challengeResponse,
    });
    
    const livenessScore = livenessResponse.data.livenessScore;
    session.scores.liveness = livenessScore;
    session.state = 'behaviour';
    
    if (livenessScore < 0.8) {
      return res.json({
        sessionId,
        decision: 'DENY',
        reason: 'Liveness check failed',
        scores: session.scores,
      });
    }
    
    // Step 3: Behavioural Biometrics
    logger.info({ sessionId }, 'Starting behavioural analysis');
    const behaviourResponse = await axios.post(`${BEHAVIOURAL_SERVICE}/behaviour/score`, {
      userId: session.userId,
      behaviouralData,
    });
    
    const behaviourScore = behaviourResponse.data.trustScore;
    session.scores.behaviour = behaviourScore;
    session.state = 'risk';
    
    // Step 4: Risk Engine
    logger.info({ sessionId }, 'Evaluating risk');
    const riskResponse = await axios.post(`${RISK_ENGINE}/risk/evaluate`, {
      userId: session.userId,
      scores: {
        face: faceScore,
        liveness: livenessScore,
        behaviour: behaviourScore,
      },
      deviceId: req.body.deviceId,
    });
    
    const riskDecision = riskResponse.data;
    session.scores.risk = riskDecision.riskLevel;
    session.state = riskDecision.action === 'ALLOW' ? 'complete' : 'mfa';
    
    // Step 5: Decision
    if (riskDecision.action === 'ALLOW') {
      // Issue token
      const tokenResponse = await axios.post(`${SESSION_SERVICE}/session/issue`, {
        userId: session.userId,
        sessionId,
        scores: session.scores,
      });
      
      return res.json({
        sessionId,
        decision: 'ALLOW',
        token: tokenResponse.data.token,
        scores: session.scores,
        explanation: riskDecision.explanation,
      });
    } else if (riskDecision.action === 'CHALLENGE') {
      // Send OTP
      await axios.post(`${MFA_SERVICE}/otp/send`, {
        userId: session.userId,
        sessionId,
        method: 'email',
      });
      
      return res.json({
        sessionId,
        decision: 'CHALLENGE',
        nextStep: 'otp_verification',
        scores: session.scores,
        explanation: riskDecision.explanation,
      });
    } else {
      return res.json({
        sessionId,
        decision: 'DENY',
        reason: riskDecision.reason,
        scores: session.scores,
        explanation: riskDecision.explanation,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    logger.error({ error }, 'Error in login/verify');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/login/otp-complete
app.post('/auth/login/otp-complete', async (req, res) => {
  try {
    const { sessionId, otpCode } = OTPCompleteSchema.parse(req.body);
    
    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Verify OTP
    const otpResponse = await axios.post(`${MFA_SERVICE}/otp/verify`, {
      sessionId,
      otpCode,
    });
    
    if (!otpResponse.data.valid) {
      return res.status(401).json({ error: 'Invalid OTP' });
    }
    
    // Issue token
    const tokenResponse = await axios.post(`${SESSION_SERVICE}/session/issue`, {
      userId: session.userId,
      sessionId,
      scores: session.scores,
    });
    
    session.state = 'complete';
    
    res.json({
      sessionId,
      decision: 'ALLOW',
      token: tokenResponse.data.token,
      scores: session.scores,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    logger.error({ error }, 'Error in otp-complete');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-orchestration' });
});

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Auth Orchestration Service started');
});


