import { useCallback, useEffect, useRef, useState } from 'react';
import { FilesetResolver, FaceLandmarker, type FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import type { FacialFeatures, Landmark3D } from '../types/signbridge';
import { computeFacialFeatures } from '../lib/grammar';
import type { TrackerStatus } from './useHands';

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export interface DetectedFaceFrame {
  landmarks: Landmark3D[] | null;
  features: FacialFeatures | null;
}

let sharedFaceLandmarker: FaceLandmarker | null = null;
let sharedFacePromise: Promise<FaceLandmarker> | null = null;

async function getOrCreateFaceLandmarker(): Promise<FaceLandmarker> {
  if (sharedFaceLandmarker) return sharedFaceLandmarker;
  if (sharedFacePromise) return sharedFacePromise;

  sharedFacePromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
    try {
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: FACE_MODEL_URL,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
        outputFaceBlendshapes: false,
      });
      sharedFaceLandmarker = landmarker;
      return landmarker;
    } catch {
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: FACE_MODEL_URL,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
        outputFaceBlendshapes: false,
      });
      sharedFaceLandmarker = landmarker;
      return landmarker;
    }
  })();

  return sharedFacePromise;
}

export function useFace(autoLoad = false) {
  const [status, setStatus] = useState<TrackerStatus>(sharedFaceLandmarker ? 'ready' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(sharedFaceLandmarker);

  const loadModel = useCallback(async () => {
    if (landmarkerRef.current) {
      setStatus('ready');
      return true;
    }
    setStatus('loading');
    setError(null);
    try {
      landmarkerRef.current = await getOrCreateFaceLandmarker();
      setStatus('ready');
      return true;
    } catch (err) {
      setStatus('error');
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load MediaPipe FaceLandmarker model.'
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
    (video: HTMLVideoElement, timestampMs: number): DetectedFaceFrame | null => {
      const detector = landmarkerRef.current;
      if (!detector || video.readyState < 2) return null;

      try {
        const result: FaceLandmarkerResult = detector.detectForVideo(video, timestampMs);
        if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
          return { landmarks: null, features: null };
        }

        const landmarks = result.faceLandmarks[0].map((p) => ({ x: p.x, y: p.y, z: p.z }));
        const matrix = result.facialTransformationMatrixes?.[0]?.data ?? null;
        const features = computeFacialFeatures(landmarks, matrix, timestampMs);
        return { landmarks, features };
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
