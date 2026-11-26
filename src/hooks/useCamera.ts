import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraStatus = 'idle' | 'requesting' | 'active' | 'error';

export interface CameraErrorInfo {
  code: 'PERMISSION_DENIED' | 'NO_CAMERA' | 'INSECURE_CONTEXT' | 'UNSUPPORTED' | 'UNKNOWN';
  title: string;
  message: string;
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [error, setError] = useState<CameraErrorInfo | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStatus('idle');
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);

    if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost') {
      setStatus('error');
      setError({
        code: 'INSECURE_CONTEXT',
        title: 'HTTPS required for webcam access',
        message: 'Browsers restrict webcam access to HTTPS origins or localhost. Open SignBridge over HTTPS or use Demo Simulation mode.',
      });
      return false;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('error');
      setError({
        code: 'UNSUPPORTED',
        title: 'Camera API unavailable',
        message: 'This browser does not expose navigator.mediaDevices.getUserMedia. Try Chrome, Edge, or Firefox, or use Demo Simulation mode.',
      });
      return false;
    }

    setStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
          facingMode: 'user',
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus('active');
      return true;
    } catch (err) {
      const e = err as DOMException;
      setStatus('error');
      if (e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError') {
        setError({
          code: 'PERMISSION_DENIED',
          title: 'Camera permission declined',
          message: 'Allow webcam access in your browser address bar to track live hand and face landmarks, or continue with Demo Simulation mode.',
        });
      } else if (e?.name === 'NotFoundError' || e?.name === 'DevicesNotFoundError') {
        setError({
          code: 'NO_CAMERA',
          title: 'No webcam detected',
          message: 'No camera hardware was found on this device. Connect a webcam or use Demo Simulation mode to test the full pipeline.',
        });
      } else {
        setError({
          code: 'UNKNOWN',
          title: 'Unable to start camera',
          message: e?.message || 'Camera initialization failed. Ensure no other app holds exclusive lock on your webcam.',
        });
      }
      return false;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    videoRef,
    status,
    error,
    isActive: status === 'active',
    startCamera,
    stopCamera,
  };
}
