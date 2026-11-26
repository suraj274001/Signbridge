import test from 'node:test';
import assert from 'node:assert/strict';
import { ISL_SIGNS } from '../data/signs';
import { mapGlossToEmoji, mapGlossSequenceToEmojis, mapGrammarToEmoji } from './emojiMap';

test('every built-in ISL sign has a dedicated non-fallback emoji mapping', () => {
  assert.ok(ISL_SIGNS.length >= 30);
  for (const sign of ISL_SIGNS) {
    const mapped = mapGlossToEmoji(sign.gloss);
    assert.equal(mapped.isFallback, false, `Missing emoji mapping for ${sign.gloss}`);
    assert.ok(mapped.emoji.length > 0);
  }
});

test('mapGlossToEmoji normalizes whitespace/case and provides fallback for custom labels', () => {
  assert.equal(mapGlossToEmoji('thank you').emoji, '🙏');
  assert.equal(mapGlossToEmoji('water').emoji, '💧');

  const custom = mapGlossToEmoji('custom_label');
  assert.equal(custom.isFallback, true);
  assert.equal(custom.emoji, '🤟');
  assert.equal(custom.label, 'Custom label');
});

test('mapGlossSequenceToEmojis limits the trail to maxItems and preserves order', () => {
  const trail = mapGlossSequenceToEmojis(
    ['HELLO', 'ME', 'WANT', 'WATER', 'PLEASE', 'THANK_YOU', 'GOOD'],
    4
  );
  assert.equal(trail.length, 4);
  assert.deepEqual(
    trail.map((t) => t.gloss),
    ['WATER', 'PLEASE', 'THANK_YOU', 'GOOD']
  );
});

test('mapGrammarToEmoji maps all non-manual grammar classes cleanly', () => {
  assert.equal(mapGrammarToEmoji('POLAR_QUESTION').emoji, '🤨');
  assert.equal(mapGrammarToEmoji('WH_QUESTION').emoji, '🧐');
  assert.equal(mapGrammarToEmoji('NEGATION').emoji, '🚫');
  assert.equal(mapGrammarToEmoji('NEUTRAL').emoji, '💬');
});
