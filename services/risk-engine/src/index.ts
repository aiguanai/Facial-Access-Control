import express from 'express';
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

const PORT = process.env.PORT || 3007;

// Policy configuration (in production, load from database/config service)
interface Policy {
  thresholds: {
    allow: {
      face: number;
      liveness: number;
      behaviour: number;
      combined: number;
    };
    challenge: {
      face: number;
      liveness: number;
      behaviour: number;
      combined: number;
    };
  };
  weights: {
    face: number;
    liveness: number;
    behaviour: number;
  };
}

const defaultPolicy: Policy = {
  thresholds: {
    allow: {
      face: 0.85,
      liveness: 0.85,
      behaviour: 0.80,
      combined: 0.82,
    },
    challenge: {
      face: 0.70,
      liveness: 0.75,
      behaviour: 0.65,
      combined: 0.70,
    },
  },
  weights: {
    face: 0.35,
    liveness: 0.35,
    behaviour: 0.30,
  },
};

// Schemas
const RiskEvaluateRequestSchema = z.object({
  userId: z.string(),
  scores: z.object({
    face: z.number().min(0).max(1),
    liveness: z.number().min(0).max(1),
    behaviour: z.number().min(0).max(1),
  }),
  deviceId: z.string().optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
});

type RiskLevel = 'low' | 'medium' | 'high';
type Action = 'ALLOW' | 'CHALLENGE' | 'DENY';

interface RiskEvaluation {
  action: Action;
  riskLevel: RiskLevel;
  combinedScore: number;
  explanation: {
    face: { score: number; status: string };
    liveness: { score: number; status: string };
    behaviour: { score: number; status: string };
    overall: string;
  };
  reason?: string;
}

function calculateRiskLevel(combinedScore: number): RiskLevel {
  if (combinedScore >= 0.85) return 'low';
  if (combinedScore >= 0.70) return 'medium';
  return 'high';
}

function evaluateRisk(scores: { face: number; liveness: number; behaviour: number }, policy: Policy): RiskEvaluation {
  const { face, liveness, behaviour } = scores;
  const { weights, thresholds } = policy;
  
  // Weighted combined score
  const combinedScore = 
    face * weights.face +
    liveness * weights.liveness +
    behaviour * weights.behaviour;
  
  const riskLevel = calculateRiskLevel(combinedScore);
  
  // Individual score status
  const faceStatus = face >= thresholds.allow.face ? 'pass' : 
                     face >= thresholds.challenge.face ? 'warning' : 'fail';
  const livenessStatus = liveness >= thresholds.allow.liveness ? 'pass' :
                         liveness >= thresholds.challenge.liveness ? 'warning' : 'fail';
  const behaviourStatus = behaviour >= thresholds.allow.behaviour ? 'pass' :
                          behaviour >= thresholds.challenge.behaviour ? 'warning' : 'fail';
  
  // Decision logic
  let action: Action;
  let reason: string | undefined;
  
  // Check if any critical score is too low
  if (face < thresholds.challenge.face || 
      liveness < thresholds.challenge.liveness ||
      behaviour < thresholds.challenge.behaviour) {
    action = 'DENY';
    reason = 'One or more biometric scores below minimum threshold';
  }
  // Check if all scores meet allow threshold
  else if (face >= thresholds.allow.face &&
           liveness >= thresholds.allow.liveness &&
           behaviour >= thresholds.allow.behaviour &&
           combinedScore >= thresholds.allow.combined) {
    action = 'ALLOW';
  }
  // Check if scores meet challenge threshold
  else if (combinedScore >= thresholds.challenge.combined) {
    action = 'CHALLENGE';
    reason = 'Scores require additional verification';
  }
  // Otherwise deny
  else {
    action = 'DENY';
    reason = 'Combined risk score too low';
  }
  
  // Generate explanation
  const explanation = {
    face: {
      score: face,
      status: faceStatus,
    },
    liveness: {
      score: liveness,
      status: livenessStatus,
    },
    behaviour: {
      score: behaviour,
      status: behaviourStatus,
    },
    overall: `Combined score: ${(combinedScore * 100).toFixed(1)}% - Risk level: ${riskLevel}`,
  };
  
  return {
    action,
    riskLevel,
    combinedScore,
    explanation,
    reason,
  };
}

// POST /risk/evaluate
app.post('/risk/evaluate', (req, res) => {
  try {
    const request = RiskEvaluateRequestSchema.parse(req.body);
    
    // In production, load policy per user/tenant
    const policy = defaultPolicy;
    
    const evaluation = evaluateRisk(request.scores, policy);
    
    logger.info({
      userId: request.userId,
      action: evaluation.action,
      riskLevel: evaluation.riskLevel,
      combinedScore: evaluation.combinedScore,
    }, 'Risk evaluation completed');
    
    res.json(evaluation);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    logger.error({ error }, 'Error in risk evaluation');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /risk/policy
app.get('/risk/policy', (req, res) => {
  res.json(defaultPolicy);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'risk-engine' });
});

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Risk Engine Service started');
});

