import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFacialFeatures,
  classifyFacialGrammar,
  generateSyntheticFacialWindow,
} from './grammar';
import type { Landmark3D } from '../types/signbridge';

function createMockFaceLandmarks(overrides: Record<number, Landmark3D> = {}): Landmark3D[] {
  const pts: Landmark3D[] = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  // Eyes outer corners (inter-eye distance = 0.2)
  pts[33] = { x: 0.4, y: 0.42, z: 0 };
  pts[263] = { x: 0.6, y: 0.42, z: 0 };
  // Upper eyelids
  pts[159] = { x: 0.44, y: 0.41, z: 0 };
  pts[386] = { x: 0.56, y: 0.41, z: 0 };
  // Eyebrow arches (neutral lift = 0.044 / 0.2 = 0.22)
  pts[105] = { x: 0.44, y: 0.366, z: 0 };
  pts[334] = { x: 0.56, y: 0.366, z: 0 };
  // Inner eyebrows (neutral gap = 0.068 / 0.2 = 0.34)
  pts[107] = { x: 0.466, y: 0.37, z: 0 };
  pts[336] = { x: 0.534, y: 0.37, z: 0 };
  // Mouth
  pts[61] = { x: 0.45, y: 0.62, z: 0 };
  pts[291] = { x: 0.55, y: 0.62, z: 0 };
  pts[13] = { x: 0.5, y: 0.615, z: 0 };
  pts[14] = { x: 0.5, y: 0.625, z: 0 };
  // Nose, cheeks, forehead, chin
  pts[1] = { x: 0.5, y: 0.52, z: -0.05 };
  pts[10] = { x: 0.5, y: 0.25, z: 0 };
  pts[152] = { x: 0.5, y: 0.78, z: 0 };
  pts[234] = { x: 0.3, y: 0.5, z: 0 };
  pts[454] = { x: 0.7, y: 0.5, z: 0 };

  for (const [k, v] of Object.entries(overrides)) {
    pts[Number(k)] = v;
  }
  return pts;
}

test('computeFacialFeatures normalizes brow raise by inter-eye distance', () => {
  const base = createMockFaceLandmarks({
    105: { x: 0.44, y: 0.33, z: 0 }, // raised brow: lift = 0.08 / 0.2 = 0.40
    334: { x: 0.56, y: 0.33, z: 0 },
  });
  const f1 = computeFacialFeatures(base);
  // Scale whole face by 0.5x around origin
  const scaled = base.map((p) => ({ x: p.x * 0.5, y: p.y * 0.5, z: p.z * 0.5 }));
  const f2 = computeFacialFeatures(scaled);

  assert.ok(Math.abs(f1.eyebrowRaise - 0.4) < 1e-4);
  assert.ok(Math.abs(f1.eyebrowRaise - f2.eyebrowRaise) < 1e-4);
  assert.ok(Math.abs(f1.mouthAspectRatio - f2.mouthAspectRatio) < 1e-4);
});

test('classifyFacialGrammar accurately detects all 4 grammar states', () => {
  const neutral = classifyFacialGrammar(generateSyntheticFacialWindow('NEUTRAL', 30));
  assert.equal(neutral.tag, 'NEUTRAL');

  const polar = classifyFacialGrammar(generateSyntheticFacialWindow('POLAR_QUESTION', 30));
  assert.equal(polar.tag, 'POLAR_QUESTION');
  assert.ok(polar.confidence >= 0.6);

  const wh = classifyFacialGrammar(generateSyntheticFacialWindow('WH_QUESTION', 30));
  assert.equal(wh.tag, 'WH_QUESTION');
  assert.ok(wh.confidence >= 0.6);

  const neg = classifyFacialGrammar(generateSyntheticFacialWindow('NEGATION', 30));
  assert.equal(neg.tag, 'NEGATION');
  assert.ok(neg.confidence >= 0.6);
});
