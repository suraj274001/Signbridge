import { useCallback, useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';
import type { Handedness, Landmark3D } from '../types/signbridge';

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export type TrackerStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface DetectedHandFrame {
  rightHand: Landmark3D[] | null;
  leftHand: Landmark3D[] | null;
  rawHands: Array<{ landmarks: Landmark3D[]; handedness: Handedness }>;
}

let sharedHandLandmarker: HandLandmarker | null = null;
let sharedHandPromise: Promise<HandLandmarker> | null = null;

async function getOrCreateHandLandmarker(): Promise<HandLandmarker> {
  if (sharedHandLandmarker) return sharedHandLandmarker;
  if (sharedHandPromise) return sharedHandPromise;

  sharedHandPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
    try {
      const landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: HAND_MODEL_URL,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      sharedHandLandmarker = landmarker;
      return landmarker;
    } catch {
      // Fallback to CPU delegate when WebGL/GPU delegate is unavailable
      const landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: HAND_MODEL_URL,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      sharedHandLandmarker = landmarker;
      return landmarker;
    }
  })();

  return sharedHandPromise;
}

export function useHands(autoLoad = false) {
  const [status, setStatus] = useState<TrackerStatus>(sharedHandLandmarker ? 'ready' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(sharedHandLandmarker);

  const loadModel = useCallback(async () => {
    if (landmarkerRef.current) {
      setStatus('ready');
      return true;
    }
    setStatus('loading');
    setError(null);
    try {
      landmarkerRef.current = await getOrCreateHandLandmarker();
      setStatus('ready');
      return true;
    } catch (err) {
      setStatus('error');
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load MediaPipe HandLandmarker model. Check network access or use Demo Simulation.'
      );
      return false;
    }
  }, []);

  useEffect(() => {
    if (autoLoad && status === 'idle') {
      void loadModel();
    }
  }, [autoLoad, status, loadModel]);

  const detectFrame = useCallback(
    (video: HTMLVideoElement, timestampMs: number): DetectedHandFrame | null => {
      const detector = landmarkerRef.current;
      if (!detector || video.readyState < 2) return null;

      try {
        const result: HandLandmarkerResult = detector.detectForVideo(video, timestampMs);
        let rightHand: Landmark3D[] | null = null;
        let leftHand: Landmark3D[] | null = null;
        const rawHands: Array<{ landmarks: Landmark3D[]; handedness: Handedness }> = [];

        if (result.landmarks && result.landmarks.length > 0) {
          for (let i = 0; i < result.landmarks.length; i++) {
            const pts = result.landmarks[i].map((p) => ({ x: p.x, y: p.y, z: p.z }));
            const rawCat = result.handednesses?.[i]?.[0]?.categoryName;
            const handedness: Handedness = rawCat === 'Left' ? 'Left' : 'Right';
            rawHands.push({ landmarks: pts, handedness });
            if (handedness === 'Right' && !rightHand) {
              rightHand = pts;
            } else if (handedness === 'Left' && !leftHand) {
              leftHand = pts;
            } else if (!rightHand) {
              rightHand = pts;
            } else if (!leftHand) {
              leftHand = pts;
            }
          }
        }

        return { rightHand, leftHand, rawHands };
      } catch {
        return null;
      }
    },
    []
  );

  return {
    status,
    error,
    isReady: status === 'ready',
    loadModel,
    detectFrame,
  };
}
