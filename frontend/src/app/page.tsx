'use client';

import { useState } from 'react';
import CameraCapture from '@/components/CameraCapture';
import { behaviouralAgent } from '@/lib/behavioural-agent';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export default function Home() {
  const [step, setStep] = useState<'login' | 'challenge' | 'otp' | 'success'>('login');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [userId, setUserId] = useState('');
  const [scores, setScores] = useState<any>(null);
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleLoginStart = async () => {
    try {
      behaviouralAgent.reset();
      
      const response = await axios.post(`${API_URL}/auth/login/start`, {
        userId,
        deviceId: behaviouralAgent.getData().deviceFingerprint,
      });

      setSessionId(response.data.sessionId);
      setStep('challenge');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start login');
    }
  };

  const handleCapture = async (blob: Blob) => {
    if (!sessionId) return;

    try {
      // Upload media
      const formData = new FormData();
      formData.append('file', blob, 'capture.jpg');
      formData.append('owner_id', userId);

      const mediaResponse = await axios.post(`${API_URL}/media/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const mediaId = mediaResponse.data.mediaId;

      // Get behavioural data
      const behaviouralData = behaviouralAgent.getData();

      // Verify
      const verifyResponse = await axios.post(`${API_URL}/auth/login/verify`, {
        sessionId,
        mediaId,
        challengeResponse: {
          blinkDetected: true, // In production, detect from video
          headTurnCompleted: true,
          colorFlashResponse: 'red',
        },
        behaviouralData,
      });

      const decision = verifyResponse.data.decision;

      if (decision === 'ALLOW') {
        setScores(verifyResponse.data.scores);
        setStep('success');
        // Store token
        localStorage.setItem('auth_token', verifyResponse.data.token);
      } else if (decision === 'CHALLENGE') {
        setScores(verifyResponse.data.scores);
        setStep('otp');
      } else {
        setError('Authentication denied: ' + verifyResponse.data.reason);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Verification failed');
    }
  };

  const handleOTPSubmit = async () => {
    if (!sessionId) return;

    try {
      const response = await axios.post(`${API_URL}/auth/login/otp-complete`, {
        sessionId,
        otpCode,
      });

      if (response.data.decision === 'ALLOW') {
        setScores(response.data.scores);
        setStep('success');
        localStorage.setItem('auth_token', response.data.token);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'OTP verification failed');
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-8 text-gray-800">
          FaceAuth - Secure Authentication
        </h1>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {step === 'login' && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-semibold mb-4">Login</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                User ID
              </label>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your user ID"
              />
            </div>
            <button
              onClick={handleLoginStart}
              disabled={!userId}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Start Authentication
            </button>
          </div>
        )}

        {step === 'challenge' && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-semibold mb-4">Face Verification</h2>
            <p className="text-gray-600 mb-6">
              Please position your face in the camera and follow the prompts
            </p>
            <CameraCapture
              onCapture={handleCapture}
              challengeType="blink"
            />
          </div>
        )}

        {step === 'otp' && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-semibold mb-4">Additional Verification Required</h2>
            {scores && (
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold mb-2">Authentication Scores:</h3>
                <ul className="space-y-1 text-sm">
                  <li>Face Match: {(scores.face * 100).toFixed(1)}%</li>
                  <li>Liveness: {(scores.liveness * 100).toFixed(1)}%</li>
                  <li>Behaviour: {(scores.behaviour * 100).toFixed(1)}%</li>
                  <li>Risk Level: {scores.risk}</li>
                </ul>
              </div>
            )}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter OTP Code
              </label>
              <input
                type="text"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="000000"
                maxLength={6}
              />
            </div>
            <button
              onClick={handleOTPSubmit}
              disabled={otpCode.length !== 6}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Verify OTP
            </button>
          </div>
        )}

        {step === 'success' && (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-2xl font-semibold mb-4 text-green-600">
              Authentication Successful!
            </h2>
            {scores && (
              <div className="mt-6 p-4 bg-gray-50 rounded-lg text-left">
                <h3 className="font-semibold mb-2">Final Scores:</h3>
                <ul className="space-y-1 text-sm">
                  <li>Face Match: {(scores.face * 100).toFixed(1)}%</li>
                  <li>Liveness: {(scores.liveness * 100).toFixed(1)}%</li>
                  <li>Behaviour: {(scores.behaviour * 100).toFixed(1)}%</li>
                  <li>Risk Level: {scores.risk}</li>
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

