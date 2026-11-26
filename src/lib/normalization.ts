import type { Handedness, Landmark3D, HandTrajectorySpec } from '../types/signbridge';

/**
 * MediaPipe Hand Landmarker indices:
 * 0: WRIST
 * 1..4: THUMB (CMC, MCP, IP, TIP)
 * 5..8: INDEX (MCP, PIP, DIP, TIP)
 * 9..12: MIDDLE (MCP, PIP, DIP, TIP)
 * 13..16: RING (MCP, PIP, DIP, TIP)
 * 17..20: PINKY (MCP, PIP, DIP, TIP)
 */
export const WRIST_INDEX = 0;
export const INDEX_MCP_INDEX = 5;
export const MIDDLE_MCP_INDEX = 9;
export const PINKY_MCP_INDEX = 17;

export const HAND_FEATURE_LENGTH = 63; // 21 landmarks * 3 (x, y, z)
export const TWO_HAND_FEATURE_LENGTH = 129; // 63 (right) + 63 (left) + 3 (normalized wrist-to-wrist vector)

export const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const EPSILON = 1e-6;

/**
 * Pure Palm-Coordinate Normalization
 *
 * Transforms raw 21-point 3D hand landmarks into a translation-, scale-,
 * in-plane-rotation-, and handedness-invariant 63-feature vector:
 *
 * 1. Wrist-centered zeroing: subtract landmark 0 from every landmark so the wrist is at (0, 0, 0).
 * 2. Palm-span scaling: divide all coordinates by ||landmark[9] - landmark[0]|| (wrist to middle-MCP),
 *    making the representation invariant to distance from camera and hand size.
 * 3. Left-hand horizontal mirroring: for 'Left' handedness, negate X before rotational alignment
 *    so a mirrored left hand maps onto the exact canonical right-hand coordinate frame.
 * 4. Rotational alignment: rotate every landmark around the Z axis in the image plane so the
 *    wrist -> middle-MCP vector aligns to the fixed upward canonical axis (0, -1, 0) in screen coords.
 * 5. Flatten 21 landmarks x (x, y, z) into exactly 63 deterministic floating-point features.
 */
export function normalizeHand(
  landmarks: Landmark3D[],
  handedness: Handedness = 'Right'
): number[] {
  if (!landmarks || landmarks.length !== 21) {
    return new Array<number>(HAND_FEATURE_LENGTH).fill(0);
  }

  const wrist = landmarks[WRIST_INDEX];
  const midMcp = landmarks[MIDDLE_MCP_INDEX];

  // Step 1: Wrist-centered zeroing
  const centered: Landmark3D[] = landmarks.map((pt) => ({
    x: pt.x - wrist.x,
    y: pt.y - wrist.y,
    z: pt.z - wrist.z,
  }));

  // Step 2: Palm-span scaling (wrist -> middle-finger MCP Euclidean distance)
  const dx = midMcp.x - wrist.x;
  const dy = midMcp.y - wrist.y;
  const dz = midMcp.z - wrist.z;
  const palmSpan = Math.hypot(dx, dy, dz);
  const safeSpan = palmSpan > EPSILON ? palmSpan : 1;

  // Step 3 (handedness unification): Mirror left hand horizontally (x -> -x)
  // Applied prior to Z-plane rotational alignment so a horizontally mirrored left hand
  // rotated by -theta aligns identically to its right-hand counterpart rotated by +theta.
  const mirrorSign = handedness === 'Left' ? -1 : 1;

  const scaled: Landmark3D[] = centered.map((pt) => ({
    x: (pt.x / safeSpan) * mirrorSign,
    y: pt.y / safeSpan,
    z: pt.z / safeSpan,
  }));

  // Step 4: Rotational alignment of wrist -> middle-MCP vector to canonical axis (0, -1, 0)
  // In screen/MediaPipe coordinates, upward fingers point along -Y (angle = -PI/2).
  const ref = scaled[MIDDLE_MCP_INDEX];
  const planarLen = Math.hypot(ref.x, ref.y);
  let cosA = 1;
  let sinA = 0;

  if (planarLen > EPSILON) {
    const currentAngle = Math.atan2(ref.y, ref.x);
    const targetAngle = -Math.PI / 2; // Canonical vertical axis (0, -1)
    const deltaAngle = targetAngle - currentAngle;
    cosA = Math.cos(deltaAngle);
    sinA = Math.sin(deltaAngle);
  }

  // Step 5: Rotate and pack into 63 features
  const features = new Array<number>(HAND_FEATURE_LENGTH);
  for (let i = 0; i < 21; i++) {
    const p = scaled[i];
    const rx = p.x * cosA - p.y * sinA;
    const ry = p.x * sinA + p.y * cosA;
    const rz = p.z;

    const base = i * 3;
    // Clamp tiny floating-point noise near zero for deterministic tests
    features[base] = Math.abs(rx) < 1e-12 ? 0 : rx;
    features[base + 1] = Math.abs(ry) < 1e-12 ? 0 : ry;
    features[base + 2] = Math.abs(rz) < 1e-12 ? 0 : rz;
  }

  return features;
}

/**
 * Convert a 63-feature normalized vector back to 21 Landmark3D points for 2D/3D visualization.
 */
export function featuresToLandmarks(features: number[]): Landmark3D[] {
  const pts: Landmark3D[] = [];
  for (let i = 0; i < 21; i++) {
    const base = i * 3;
    pts.push({
      x: features[base] ?? 0,
      y: features[base + 1] ?? 0,
      z: features[base + 2] ?? 0,
    });
  }
  return pts;
}

/**
 * Compute palm-span Euclidean length for a raw 21-point hand.
 */
export function getPalmSpan(landmarks: Landmark3D[] | null): number {
  if (!landmarks || landmarks.length !== 21) return 0;
  const w = landmarks[WRIST_INDEX];
  const m = landmarks[MIDDLE_MCP_INDEX];
  return Math.hypot(m.x - w.x, m.y - w.y, m.z - w.z);
}

/**
 * Two-hand frame normalization.
 * Concatenates:
 *   [0..62]    Normalized primary/right hand (63 floats)
 *   [63..125]  Normalized secondary/left hand (63 floats)
 *   [126..128] Normalized relative wrist-to-wrist vector (leftWrist - rightWrist) / avgPalmSpan
 * Total: exactly 129 features per frame.
 */
export function normalizeTwoHands(
  rightHand: Landmark3D[] | null,
  leftHand: Landmark3D[] | null
): number[] {
  const rightFeats = rightHand
    ? normalizeHand(rightHand, 'Right')
    : new Array<number>(HAND_FEATURE_LENGTH).fill(0);
  const leftFeats = leftHand
    ? normalizeHand(leftHand, 'Left')
    : new Array<number>(HAND_FEATURE_LENGTH).fill(0);

  let relX = 0;
  let relY = 0;
  let relZ = 0;

  if (rightHand && rightHand.length === 21 && leftHand && leftHand.length === 21) {
    const rSpan = getPalmSpan(rightHand);
    const lSpan = getPalmSpan(leftHand);
    const avgSpan = (rSpan + lSpan) / 2;
    const denom = avgSpan > EPSILON ? avgSpan : 1;

    relX = (leftHand[WRIST_INDEX].x - rightHand[WRIST_INDEX].x) / denom;
    relY = (leftHand[WRIST_INDEX].y - rightHand[WRIST_INDEX].y) / denom;
    relZ = (leftHand[WRIST_INDEX].z - rightHand[WRIST_INDEX].z) / denom;
  }

  return [...rightFeats, ...leftFeats, relX, relY, relZ];
}

/**
 * Apply rigid 2D/3D similarity transform (scale, Z-rotation, translation) to a 21-point hand.
 * Used both in unit tests and on the /lab normalization invariance visualizer.
 */
export function transformLandmarks(
  landmarks: Landmark3D[],
  opts: { scale?: number; rotationDeg?: number; offsetX?: number; offsetY?: number; offsetZ?: number; mirrorX?: boolean }
): Landmark3D[] {
  const scale = opts.scale ?? 1;
  const rad = ((opts.rotationDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const ox = opts.offsetX ?? 0;
  const oy = opts.offsetY ?? 0;
  const oz = opts.offsetZ ?? 0;
  const mx = opts.mirrorX ? -1 : 1;

  return landmarks.map((p) => {
    const sx = p.x * scale * mx;
    const sy = p.y * scale;
    const sz = p.z * scale;
    return {
      x: sx * cos - sy * sin + ox,
      y: sx * sin + sy * cos + oy,
      z: sz + oz,
    };
  });
}

/**
 * Generate an anatomically plausible 21-point MediaPipe hand skeleton in screen coordinates
 * for a given handshape, handedness, and animation phase t in [0..1].
 */
export function generateCanonicalHand(
  handshape: HandTrajectorySpec['handshape'] = 'flat_open',
  handedness: Handedness = 'Right',
  phase = 0
): Landmark3D[] {
  // Curl profiles: [thumb, index, middle, ring, pinky] in 0 (extended) .. 1 (closed fist)
  const curlMap: Record<HandTrajectorySpec['handshape'], [number, number, number, number, number]> = {
    flat_open: [0.1, 0.05, 0.05, 0.05, 0.08],
    fist: [0.85, 0.95, 0.95, 0.95, 0.95],
    point_index: [0.75, 0.05, 0.92, 0.94, 0.95],
    peace_v: [0.8, 0.05, 0.05, 0.92, 0.95],
    thumbs_up: [0.05, 0.95, 0.95, 0.95, 0.95],
    cup_c: [0.45, 0.5, 0.52, 0.55, 0.58],
    pinch_o: [0.65, 0.65, 0.25, 0.22, 0.2],
    claw: [0.4, 0.62, 0.65, 0.68, 0.7],
    l_shape: [0.05, 0.05, 0.94, 0.95, 0.96],
    y_shape: [0.05, 0.94, 0.95, 0.94, 0.05],
  };

  const curls = curlMap[handshape] ?? curlMap.flat_open;
  const wobble = Math.sin(phase * Math.PI * 2) * 0.04;
  const pts: Landmark3D[] = [];

  // 0: Wrist at origin
  pts.push({ x: 0, y: 0, z: 0 });

  // Finger base MCP offsets relative to wrist (palmSpan ~ 0.18 in screen space)
  const palmLen = 0.18;

  // Thumb: 1..4
  const tCurl = curls[0];
  pts.push({ x: -0.055, y: -0.045, z: -0.01 });
  pts.push({ x: -0.095 + tCurl * 0.03, y: -0.095 + tCurl * 0.01, z: -0.025 });
  pts.push({ x: -0.125 + tCurl * 0.07, y: -0.14 + tCurl * 0.04, z: -0.03 - tCurl * 0.02 });
  pts.push({ x: -0.145 + tCurl * 0.11, y: -0.18 + tCurl * 0.08 + wobble * 0.2, z: -0.035 - tCurl * 0.03 });

  // 4 fingers: index (5..8), middle (9..12), ring (13..16), pinky (17..20)
  const fingerConfigs = [
    { xBase: -0.052, yBase: -0.165, len: 0.13, spread: -0.022, curl: curls[1] },
    { xBase: 0.0, yBase: -palmLen, len: 0.145, spread: 0.0, curl: curls[2] },
    { xBase: 0.048, yBase: -0.165, len: 0.132, spread: 0.018, curl: curls[3] },
    { xBase: 0.09, yBase: -0.14, len: 0.105, spread: 0.035, curl: curls[4] },
  ];

  for (const f of fingerConfigs) {
    // MCP
    pts.push({ x: f.xBase, y: f.yBase, z: 0 });

    // PIP, DIP, TIP progressively curl inward (+Y and -Z toward camera)
    const seg1 = f.len * 0.42;
    const seg2 = f.len * 0.32;
    const seg3 = f.len * 0.26;
    const c = f.curl;

    const pipY = f.yBase - seg1 * (1 - c * 0.55);
    const pipZ = -seg1 * c * 0.45;
    const pipX = f.xBase + f.spread * (1 - c * 0.7) + wobble * 0.15;
    pts.push({ x: pipX, y: pipY, z: pipZ });

    const dipY = pipY - seg2 * (1 - c * 1.15);
    const dipZ = pipZ - seg2 * c * 0.5;
    const dipX = pipX + f.spread * 0.7 * (1 - c * 0.8);
    pts.push({ x: dipX, y: dipY, z: dipZ });

    const tipY = dipY - seg3 * (1 - c * 1.65);
    const tipZ = dipZ - seg3 * c * 0.25;
    const tipX = dipX + f.spread * 0.5 * (1 - c);
    pts.push({ x: tipX, y: tipY, z: tipZ });
  }

  if (handedness === 'Left') {
    return pts.map((p) => ({ x: -p.x, y: p.y, z: p.z }));
  }
  return pts;
}

/**
 * Generate a full 30-frame normalized sequence (30 x 129) for a SignDefinition's prototypeSpec.
 * Enables deterministic out-of-the-box k-NN + DTW classification and simulation demos.
 */
export function generatePrototypeSequence(
  spec: HandTrajectorySpec,
  numFrames = 30
): number[][] {
  const frames: number[][] = [];
  for (let i = 0; i < numFrames; i++) {
    const t = i / Math.max(1, numFrames - 1);
    const baseRight = generateCanonicalHand(spec.handshape, 'Right', t);

    // Apply motion-specific subtle articulation & trajectory modulation
    // Note: palm-coordinate normalization removes global translation/Z-rotation on a single hand,
    // so motion signatures are encoded through natural finger articulation dynamics + Z-tilt +
    // relative wrist-to-wrist vector for two-handed signs.
    const modulatedRight = baseRight.map((pt, idx) => {
      let dx = 0;
      let dy = 0;
      let dz = 0;
      const tipFactor = idx % 4 === 0 && idx > 0 ? 1.0 : idx >= 5 ? 0.45 : 0.1;

      switch (spec.motion) {
        case 'wave':
          dx = Math.sin(t * Math.PI * 4) * 0.025 * tipFactor;
          break;
        case 'forward_arc':
          dz = -Math.sin(t * Math.PI) * 0.06 * tipFactor;
          dy = Math.sin(t * Math.PI) * 0.02 * tipFactor;
          break;
        case 'chest_circle':
          dx = Math.cos(t * Math.PI * 2) * 0.02 * tipFactor;
          dz = Math.sin(t * Math.PI * 2) * 0.03 * tipFactor;
          break;
        case 'nod_tap':
          dy = Math.abs(Math.sin(t * Math.PI * 2)) * 0.035 * tipFactor;
          dz = -Math.abs(Math.sin(t * Math.PI * 2)) * 0.04 * tipFactor;
          break;
        case 'side_shake':
          dx = Math.sin(t * Math.PI * 3) * 0.03 * tipFactor;
          dz = Math.cos(t * Math.PI * 3) * 0.02 * tipFactor;
          break;
        case 'lift_up':
          dy = -t * 0.03 * tipFactor;
          dz = -t * 0.03 * tipFactor;
          break;
        case 'chin_out':
          dz = -t * 0.07 * tipFactor;
          break;
        case 'forehead_out':
          dz = -Math.sin(t * Math.PI) * 0.05 * tipFactor;
          dx = t * 0.025 * tipFactor;
          break;
        case 'point_self':
          dz = Math.sin(t * Math.PI) * 0.06 * tipFactor;
          break;
        case 'point_out':
          dz = -Math.sin(t * Math.PI) * 0.08 * tipFactor;
          break;
        case 'palm_flip':
          dz = Math.cos(t * Math.PI) * 0.05 * tipFactor;
          dx = Math.sin(t * Math.PI) * 0.02 * tipFactor;
          break;
        case 'two_hand_meet':
          dz = -Math.sin(t * Math.PI) * 0.04 * tipFactor;
          break;
        case 'push_down':
          dy = t * 0.04 * tipFactor;
          dz = -t * 0.04 * tipFactor;
          break;
      }

      return { x: pt.x + dx, y: pt.y + dy, z: pt.z + dz };
    });

    const positionedRight = transformLandmarks(modulatedRight, {
      offsetX: 0.58 + (spec.motion === 'two_hand_meet' ? -Math.sin(t * Math.PI) * 0.12 : 0),
      offsetY: 0.62 - (spec.motion === 'lift_up' ? t * 0.15 : 0),
      offsetZ: 0,
    });

    let positionedLeft: Landmark3D[] | null = null;
    if (spec.twoHanded) {
      const baseLeft = generateCanonicalHand(spec.handshape, 'Left', t);
      positionedLeft = transformLandmarks(baseLeft, {
        offsetX: 0.42 + (spec.motion === 'two_hand_meet' ? Math.sin(t * Math.PI) * 0.12 : 0),
        offsetY: 0.62 - (spec.motion === 'lift_up' ? t * 0.15 : 0),
        offsetZ: 0,
      });
    }

    frames.push(normalizeTwoHands(positionedRight, positionedLeft));
  }
  return frames;
}
