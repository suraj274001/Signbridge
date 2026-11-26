import test from 'node:test';
import assert from 'node:assert/strict';
import { dtwDistance, KNNDTWClassifier, resampleSequence } from './classifier';
import { getBuiltInSignPrototypes } from '../data/signs';

test('dtwDistance returns 0 for identical sequences and small distance for time-warped copies', () => {
  const prototypes = getBuiltInSignPrototypes();
  assert.ok(prototypes.length >= 30, `Expected at least 30 sample signs, got ${prototypes.length}`);

  const hello = prototypes.find((p) => p.label === 'HELLO')!;
  const help = prototypes.find((p) => p.label === 'HELP')!;

  assert.equal(dtwDistance(hello.frames, hello.frames), 0);

  // Slightly time-warped version of HELLO (first 24 frames resampled to 30)
  const warpedHello = resampleSequence(hello.frames.slice(2, 28), 30);
  const dSame = dtwDistance(warpedHello, hello.frames);
  const dOther = dtwDistance(warpedHello, help.frames);
  assert.ok(dSame < dOther, `Expected warped HELLO (${dSame}) closer to HELLO than HELP (${dOther})`);
});

test('KNNDTWClassifier predicts built-in signs accurately out of the box', () => {
  const prototypes = getBuiltInSignPrototypes();
  const clf = new KNNDTWClassifier(prototypes, 3, 2);

  for (const label of ['HELLO', 'HELP', 'WATER', 'WHAT', 'LOVE']) {
    const tpl = prototypes.find((p) => p.label === label)!;
    // Add slight sensor noise to simulate webcam jitter
    const noisy = tpl.frames.map((frame) =>
      frame.map((v) => (v === 0 ? 0 : v + 0.004))
    );
    const pred = clf.predict(noisy);
    assert.equal(pred.gloss, label, `Expected ${label}, got ${pred.gloss}`);
    assert.ok(pred.confidence >= 0.7, `Confidence too low for ${label}: ${pred.confidence}`);
  }
});
