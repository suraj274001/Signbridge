import test from 'node:test';
import assert from 'node:assert/strict';
import { ISL_SIGNS } from '../data/signs';
import { filterSigns, getActiveKeyframeIndex, formatTuple3 } from './signLibrary';

test('filterSigns matches English label, Hindi label, gloss, and synonyms case-insensitively', () => {
  const byEn = filterSigns(ISL_SIGNS, { query: 'water', category: 'all', handedness: 'all' });
  assert.ok(byEn.some((s) => s.gloss === 'WATER'));

  const byHi = filterSigns(ISL_SIGNS, { query: 'नमस्ते', category: 'all', handedness: 'all' });
  assert.ok(byHi.some((s) => s.gloss === 'HELLO'));

  const bySynonym = filterSigns(ISL_SIGNS, { query: 'drink', category: 'all', handedness: 'all' });
  assert.ok(bySynonym.some((s) => s.gloss === 'WATER'));
});

test('filterSigns combines category and handedness filters accurately', () => {
  const twoHandQuestions = filterSigns(ISL_SIGNS, {
    query: '',
    category: 'question',
    handedness: 'two-hand',
  });
  assert.ok(twoHandQuestions.length > 0);
  for (const s of twoHandQuestions) {
    assert.equal(s.category, 'question');
    assert.equal(s.handedness, 'two-hand');
  }
});

test('getActiveKeyframeIndex selects the nearest keyframe timestamp across [0..1]', () => {
  const sample = ISL_SIGNS.find((s) => s.keyframes.length >= 3)!;
  assert.equal(getActiveKeyframeIndex(sample.keyframes, 0), 0);
  assert.equal(getActiveKeyframeIndex(sample.keyframes, 1), sample.keyframes.length - 1);
  assert.equal(getActiveKeyframeIndex([], 0.5), -1);
});

test('formatTuple3 formats fixed-precision coordinate strings', () => {
  assert.equal(formatTuple3([0.1, -0.256, 1]), '[0.10, -0.26, 1.00]');
});
