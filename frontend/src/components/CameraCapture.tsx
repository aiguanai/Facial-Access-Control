'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface CameraCaptureProps {
  onCapture: (blob: Blob) => void;
  challengeType?: 'blink' | 'headTurn' | 'colorFlash';
  challengeColor?: string;
}

export default function CameraCapture({ onCapture, challengeType, challengeColor }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      // Request camera with constraints
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false,
      });

      // Verify it's the internal camera (basic check)
      const videoTracks = mediaStream.getVideoTracks();
      if (videoTracks.length === 0) {
        throw new Error('No camera found');
      }

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setError('Failed to access camera. Please ensure you grant camera permissions.');
      console.error('Camera error:', err);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) {
        onCapture(blob);
      }
    }, 'image/jpeg', 0.95);
  };

  const startRecording = () => {
    setIsRecording(true);
    // In production, use MediaRecorder API for video
    setTimeout(() => {
      captureFrame();
      setIsRecording(false);
    }, 2000);
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
        {error ? (
          <div className="flex items-center justify-center h-full text-red-500 p-4">
            {error}
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />
            
            {/* Challenge overlay */}
            {challengeType === 'colorFlash' && challengeColor && (
              <motion.div
                className="absolute inset-0"
                style={{ backgroundColor: challengeColor }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.3, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
              />
            )}

            {challengeType === 'blink' && (
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white px-4 py-2 rounded">
                Please blink
              </div>
            )}

            {challengeType === 'headTurn' && (
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white px-4 py-2 rounded">
                Please turn your head
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-4 flex justify-center">
        <button
          onClick={startRecording}
          disabled={!stream || isRecording}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRecording ? 'Capturing...' : 'Capture'}
        </button>
      </div>
    </div>
  );
}

