import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHand,
  normalizeTwoHands,
  generateCanonicalHand,
  transformLandmarks,
  HAND_FEATURE_LENGTH,
  TWO_HAND_FEATURE_LENGTH,
  MIDDLE_MCP_INDEX,
} from './normalization';

function assertVectorsClose(a: number[], b: number[], eps = 1e-4, label = '') {
  assert.equal(a.length, b.length, `${label}: vector lengths must match`);
  for (let i = 0; i < a.length; i++) {
    assert.ok(
      Math.abs(a[i] - b[i]) <= eps,
      `${label}: mismatch at index ${i}: ${a[i]} vs ${b[i]} (diff ${Math.abs(a[i] - b[i])})`
    );
  }
}

test('normalizeHand outputs exactly 63 features and zeros the wrist at (0,0,0)', () => {
  const hand = transformLandmarks(generateCanonicalHand('flat_open', 'Right'), {
    offsetX: 0.45,
    offsetY: 0.72,
    offsetZ: -0.15,
  });
  const norm = normalizeHand(hand, 'Right');
  assert.equal(norm.length, HAND_FEATURE_LENGTH);
  assert.equal(norm[0], 0);
  assert.equal(norm[1], 0);
  assert.equal(norm[2], 0);
});

test('normalizeHand aligns wrist->middle-MCP vector to canonical upward axis (0, -1, z)', () => {
  const hand = transformLandmarks(generateCanonicalHand('flat_open', 'Right'), {
    rotationDeg: 47,
    scale: 1.8,
    offsetX: 0.3,
    offsetY: 0.6,
  });
  const norm = normalizeHand(hand, 'Right');
  const mx = norm[MIDDLE_MCP_INDEX * 3];
  const my = norm[MIDDLE_MCP_INDEX * 3 + 1];
  const mz = norm[MIDDLE_MCP_INDEX * 3 + 2];

  // After scaling by palm span and aligning planar vector to (0, -1), x=0 and y=-sqrt(1-z^2)
  assert.ok(Math.abs(mx) < 1e-5, `middle-MCP x should be ~0, got ${mx}`);
  assert.ok(my < -0.95, `middle-MCP y should point along -Y (~ -1), got ${my}`);
  assert.ok(Math.abs(Math.hypot(mx, my, mz) - 1) < 1e-5, 'palm-span distance must equal 1.0');
});

test('normalizeHand is invariant to translation, scale, and Z-plane rotation', () => {
  const base = generateCanonicalHand('peace_v', 'Right');
  const normBase = normalizeHand(base, 'Right');

  const transformed = transformLandmarks(base, {
    scale: 2.75,
    rotationDeg: -63,
    offsetX: 12.4,
    offsetY: -8.1,
    offsetZ: 3.3,
  });
  const normTransformed = normalizeHand(transformed, 'Right');

  assertVectorsClose(normBase, normTransformed, 1e-4, 'similarity invariance');
});

test('normalizeHand mirrors Left hand horizontally so unified model matches Right hand', () => {
  const rightHand = transformLandmarks(generateCanonicalHand('l_shape', 'Right'), {
    rotationDeg: 25,
    scale: 1.3,
    offsetX: 0.6,
    offsetY: 0.5,
  });

  // Horizontally mirror the right hand to synthesize its exact left-hand counterpart
  const leftHand = rightHand.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }));

  const normRight = normalizeHand(rightHand, 'Right');
  const normLeft = normalizeHand(leftHand, 'Left');

  assertVectorsClose(normRight, normLeft, 1e-4, 'left/right mirror invariance');
});

test('normalizeTwoHands outputs exactly 129 features including scale-normalized wrist-to-wrist vector', () => {
  const right = transformLandmarks(generateCanonicalHand('flat_open', 'Right'), {
    offsetX: 0.65,
    offsetY: 0.5,
    scale: 1.0,
  });
  const left = transformLandmarks(generateCanonicalHand('flat_open', 'Left'), {
    offsetX: 0.35,
    offsetY: 0.5,
    scale: 1.0,
  });

  const feats1 = normalizeTwoHands(right, left);
  assert.equal(feats1.length, TWO_HAND_FEATURE_LENGTH);

  // Scaling the whole two-hand scene by 2x should preserve relative wrist-to-wrist vector
  const rightScaled = right.map((p) => ({ x: p.x * 2 + 1, y: p.y * 2 - 0.5, z: p.z * 2 }));
  const leftScaled = left.map((p) => ({ x: p.x * 2 + 1, y: p.y * 2 - 0.5, z: p.z * 2 }));
  const feats2 = normalizeTwoHands(rightScaled, leftScaled);

  assertVectorsClose(feats1.slice(126), feats2.slice(126), 1e-4, 'relative wrist-to-wrist invariance');
});
