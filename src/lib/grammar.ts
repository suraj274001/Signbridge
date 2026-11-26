import type {
  FacialFeatures,
  FacialGrammarTag,
  GrammarClassification,
  GrammarThresholds,
  Landmark3D,
} from '../types/signbridge';

/**
 * Key MediaPipe FaceLandmarker 468-landmark indices:
 * Eyes: left outer 33, left inner 133, left upper lid 159; right outer 263, right inner 362, right upper lid 386
 * Eyebrows: left arch 105, left inner 107; right arch 334, right inner 336
 * Mouth: upper inner lip 13, lower inner lip 14, left corner 61, right corner 291
 * Head pose fallback: nose tip 1, chin 152, forehead 10, left temple 234, right temple 454
 */
export const DEFAULT_GRAMMAR_THRESHOLDS: GrammarThresholds = {
  browRaiseThreshold: 0.31,
  browFurrowThreshold: 0.42,
  pitchForwardThreshold: 7.5,
  yawOscillationThreshold: 11.0,
  yawMinZeroCrossings: 2,
};

const EPS = 1e-6;

function dist2D(a: Landmark3D, b: Landmark3D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Extract Euler angles (pitch, yaw, roll in degrees) from MediaPipe's 4x4 column-major
 * facialTransformationMatrixes[0].data array.
 */
export function extractHeadPoseFromMatrix(matrix: Float32Array | number[]): {
  pitch: number;
  yaw: number;
  roll: number;
} {
  // MediaPipe returns a 4x4 column-major matrix:
  // m[0] m[4] m[8]  m[12]
  // m[1] m[5] m[9]  m[13]
  // m[2] m[6] m[10] m[14]
  const r00 = matrix[0];
  const r10 = matrix[1];
  const r20 = matrix[2];
  const r21 = matrix[6];
  const r22 = matrix[10];

  const sy = Math.hypot(r00, r10);
  const singular = sy < 1e-6;

  let pitchRad: number;
  let yawRad: number;
  let rollRad: number;

  if (!singular) {
    pitchRad = Math.atan2(r21, r22);
    yawRad = Math.atan2(-r20, sy);
    rollRad = Math.atan2(r10, r00);
  } else {
    pitchRad = Math.atan2(-matrix[9], matrix[5]);
    yawRad = Math.atan2(-r20, sy);
    rollRad = 0;
  }

  const radToDeg = 180 / Math.PI;
  return {
    pitch: pitchRad * radToDeg,
    yaw: yawRad * radToDeg,
    roll: rollRad * radToDeg,
  };
}

/**
 * Compute scale-normalized non-manual facial grammar features from MediaPipe's 468 face landmarks
 * and optional 4x4 facial transformation matrix.
 */
export function computeFacialFeatures(
  landmarks: Landmark3D[],
  transformationMatrix?: Float32Array | number[] | null,
  timestamp = Date.now()
): FacialFeatures {
  if (!landmarks || landmarks.length < 455) {
    return {
      timestamp,
      eyebrowRaise: 0.22,
      eyebrowFurrow: 0.2,
      interEyeDistance: 0.1,
      mouthAspectRatio: 0.08,
      headPitch: 0,
      headYaw: 0,
      headRoll: 0,
    };
  }

  const leftEyeOuter = landmarks[33];
  const rightEyeOuter = landmarks[263];
  const interEyeDistance = Math.max(dist2D(leftEyeOuter, rightEyeOuter), EPS);

  // Eyebrow raise: vertical lift of brow arches (105, 334) above upper eyelids (159, 386),
  // normalized by inter-eye distance so it stays invariant to distance from camera.
  const leftLift = (landmarks[159].y - landmarks[105].y) / interEyeDistance;
  const rightLift = (landmarks[386].y - landmarks[334].y) / interEyeDistance;
  const eyebrowRaise = Math.max(0, (leftLift + rightLift) / 2);

  // Eyebrow furrow: inward horizontal pull between inner brows (107 & 336).
  // Neutral inner-brow gap is ~0.34 * interEyeDistance; furrowing compresses it toward ~0.18.
  const innerBrowGap = dist2D(landmarks[107], landmarks[336]) / interEyeDistance;
  const eyebrowFurrow = Math.max(0, Math.min(1, (0.38 - innerBrowGap) / 0.22));

  // Mouth aspect ratio (MAR): vertical inner lip aperture / horizontal mouth width
  const mouthHeight = dist2D(landmarks[13], landmarks[14]);
  const mouthWidth = Math.max(dist2D(landmarks[61], landmarks[291]), EPS);
  const mouthAspectRatio = Math.min(1.2, mouthHeight / mouthWidth);

  let headPitch = 0;
  let headYaw = 0;
  let headRoll = 0;

  if (transformationMatrix && transformationMatrix.length >= 16) {
    const pose = extractHeadPoseFromMatrix(transformationMatrix);
    headPitch = pose.pitch;
    headYaw = pose.yaw;
    headRoll = pose.roll;
  } else {
    // Geometric fallback from key facial landmarks
    const nose = landmarks[1];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];
    const forehead = landmarks[10];
    const chin = landmarks[152];

    const midCheekX = (leftCheek.x + rightCheek.x) / 2;
    const faceWidth = Math.max(Math.abs(rightCheek.x - leftCheek.x), EPS);
    headYaw = ((nose.x - midCheekX) / faceWidth) * 90;

    const midFaceY = (forehead.y + chin.y) / 2;
    const faceHeight = Math.max(Math.abs(chin.y - forehead.y), EPS);
    headPitch = ((nose.y - midFaceY) / faceHeight) * 75;

    headRoll =
      (Math.atan2(rightEyeOuter.y - leftEyeOuter.y, rightEyeOuter.x - leftEyeOuter.x) * 180) /
      Math.PI;
  }

  return {
    timestamp,
    eyebrowRaise,
    eyebrowFurrow,
    interEyeDistance,
    mouthAspectRatio,
    headPitch,
    headYaw,
    headRoll,
  };
}

/**
 * Classify a rolling window (up to 30 frames) of FacialFeatures into a grammatical non-manual marker:
 * - NEGATION: oscillating head yaw (head shake with >= 2 direction/zero crossings and amplitude >= threshold)
 * - POLAR_QUESTION: sustained raised eyebrows + slight forward head pitch (yes/no question marker)
 * - WH_QUESTION: sustained furrowed eyebrows + slight head rotation/tilt (who/what/where/why/how marker)
 * - NEUTRAL: declarative baseline
 */
export function classifyFacialGrammar(
  window: FacialFeatures[],
  thresholds: GrammarThresholds = DEFAULT_GRAMMAR_THRESHOLDS
): GrammarClassification {
  if (!window || window.length === 0) {
    return {
      tag: 'NEUTRAL',
      confidence: 1,
      reason: 'Awaiting face landmarks',
      scores: { NEUTRAL: 1, POLAR_QUESTION: 0, WH_QUESTION: 0, NEGATION: 0 },
    };
  }

  const n = window.length;
  let sumRaise = 0;
  let sumFurrow = 0;
  let sumPitch = 0;
  let sumYaw = 0;
  let minYaw = Infinity;
  let maxYaw = -Infinity;

  for (const f of window) {
    sumRaise += f.eyebrowRaise;
    sumFurrow += f.eyebrowFurrow;
    sumPitch += f.headPitch;
    sumYaw += f.headYaw;
    if (f.headYaw < minYaw) minYaw = f.headYaw;
    if (f.headYaw > maxYaw) maxYaw = f.headYaw;
  }

  const meanRaise = sumRaise / n;
  const meanFurrow = sumFurrow / n;
  const meanPitch = sumPitch / n;
  const meanYaw = sumYaw / n;
  const yawRange = maxYaw - minYaw;

  // Count mean-centered yaw zero-crossings to detect left-right head shake oscillation
  let zeroCrossings = 0;
  let prevSign = 0;
  const deadband = 2.5;
  for (const f of window) {
    const centered = f.headYaw - meanYaw;
    const sign = centered > deadband ? 1 : centered < -deadband ? -1 : 0;
    if (sign !== 0) {
      if (prevSign !== 0 && sign !== prevSign) {
        zeroCrossings++;
      }
      prevSign = sign;
    }
  }

  // Compute continuous scores in [0..1]
  const negationScore =
    zeroCrossings >= thresholds.yawMinZeroCrossings && yawRange >= thresholds.yawOscillationThreshold
      ? Math.min(0.98, 0.58 + ((yawRange - thresholds.yawOscillationThreshold) / 25) * 0.3 + zeroCrossings * 0.05)
      : Math.min(0.35, (yawRange / (thresholds.yawOscillationThreshold * 2)) * 0.35);

  const raiseExcess = Math.max(0, meanRaise - thresholds.browRaiseThreshold);
  const pitchBonus = meanPitch >= thresholds.pitchForwardThreshold ? 0.2 : Math.max(0, meanPitch / 30) * 0.12;
  const polarScore =
    meanRaise >= thresholds.browRaiseThreshold
      ? Math.min(0.96, 0.58 + raiseExcess * 2.2 + pitchBonus)
      : Math.max(0, (meanRaise / thresholds.browRaiseThreshold) * 0.35);

  const furrowExcess = Math.max(0, meanFurrow - thresholds.browFurrowThreshold);
  const tiltBonus = Math.abs(meanYaw) >= 4 || Math.abs(meanPitch) >= 4 ? 0.14 : 0.04;
  const whScore =
    meanFurrow >= thresholds.browFurrowThreshold
      ? Math.min(0.96, 0.58 + furrowExcess * 1.1 + tiltBonus)
      : Math.max(0, (meanFurrow / thresholds.browFurrowThreshold) * 0.35);

  const maxNonNeutral = Math.max(negationScore, polarScore, whScore);
  const neutralScore = maxNonNeutral < 0.55 ? Math.min(0.98, 1 - maxNonNeutral * 0.6) : 0.18;

  const scores: Record<FacialGrammarTag, number> = {
    NEUTRAL: Number(neutralScore.toFixed(3)),
    POLAR_QUESTION: Number(polarScore.toFixed(3)),
    WH_QUESTION: Number(whScore.toFixed(3)),
    NEGATION: Number(negationScore.toFixed(3)),
  };

  if (negationScore >= 0.55 && negationScore >= polarScore && negationScore >= whScore) {
    return {
      tag: 'NEGATION',
      confidence: Number(negationScore.toFixed(2)),
      reason: `Head shake detected (${zeroCrossings} yaw reversals, ${yawRange.toFixed(1)}° span)`,
      scores,
    };
  }

  if (polarScore >= 0.55 && polarScore >= whScore) {
    return {
      tag: 'POLAR_QUESTION',
      confidence: Number(polarScore.toFixed(2)),
      reason: `Raised eyebrows (${meanRaise.toFixed(2)}) & forward head pitch (${meanPitch.toFixed(1)}°)`,
      scores,
    };
  }

  if (whScore >= 0.55) {
    return {
      tag: 'WH_QUESTION',
      confidence: Number(whScore.toFixed(2)),
      reason: `Furrowed eyebrows (${meanFurrow.toFixed(2)}) with interrogative head angle`,
      scores,
    };
  }

  return {
    tag: 'NEUTRAL',
    confidence: Number(neutralScore.toFixed(2)),
    reason: 'Neutral facial expression (declarative clause)',
    scores,
  };
}

/**
 * Generate a synthetic 30-frame window of FacialFeatures for a given grammar preset.
 * Used in unit tests and interactive demos on /translate and /lab.
 */
export function generateSyntheticFacialWindow(
  preset: FacialGrammarTag,
  frames = 30
): FacialFeatures[] {
  const result: FacialFeatures[] = [];
  const now = Date.now();
  for (let i = 0; i < frames; i++) {
    const t = i / Math.max(1, frames - 1);
    const wave = Math.sin(t * Math.PI * 2);
    if (preset === 'POLAR_QUESTION') {
      result.push({
        timestamp: now + i * 33,
        eyebrowRaise: 0.39 + Math.sin(t * Math.PI) * 0.06,
        eyebrowFurrow: 0.14,
        interEyeDistance: 0.14,
        mouthAspectRatio: 0.14 + Math.sin(t * Math.PI) * 0.04,
        headPitch: 10.5 + Math.sin(t * Math.PI) * 3.5,
        headYaw: wave * 1.5,
        headRoll: 2.0,
      });
    } else if (preset === 'WH_QUESTION') {
      result.push({
        timestamp: now + i * 33,
        eyebrowRaise: 0.19,
        eyebrowFurrow: 0.64 + Math.sin(t * Math.PI) * 0.12,
        interEyeDistance: 0.14,
        mouthAspectRatio: 0.11,
        headPitch: 4.5,
        headYaw: 8.5 + Math.sin(t * Math.PI) * 2.5,
        headRoll: -5.0,
      });
    } else if (preset === 'NEGATION') {
      result.push({
        timestamp: now + i * 33,
        eyebrowRaise: 0.21,
        eyebrowFurrow: 0.34,
        interEyeDistance: 0.14,
        mouthAspectRatio: 0.07,
        headPitch: 1.5,
        headYaw: Math.sin(t * Math.PI * 3.5) * 16.0,
        headRoll: Math.sin(t * Math.PI * 3.5) * 3.0,
      });
    } else {
      result.push({
        timestamp: now + i * 33,
        eyebrowRaise: 0.22 + wave * 0.01,
        eyebrowFurrow: 0.18 + wave * 0.01,
        interEyeDistance: 0.14,
        mouthAspectRatio: 0.09 + Math.abs(wave) * 0.02,
        headPitch: 1.0 + wave * 0.8,
        headYaw: wave * 1.2,
        headRoll: wave * 0.6,
      });
    }
  }
  return result;
}
