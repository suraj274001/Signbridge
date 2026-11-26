import test from 'node:test';
import assert from 'node:assert/strict';
import { speechToGloss, glossToSentenceRuleBased, computeWER } from './glossParser';

test('speechToGloss strips filler words and moves WH-word to the end', () => {
  const res = speechToGloss('Um, what is your name?', 'ISL');
  assert.deepEqual(res.glosses, ['YOU', 'NAME', 'WHAT']);
  assert.equal(res.facialCue, 'WH_QUESTION');
  assert.ok(res.removedFillers.includes('um'));
  assert.ok(res.removedFillers.includes('is'));
});

test('speechToGloss handles multi-word thank you and negation reordering', () => {
  const thankRes = speechToGloss('Hello, thank you for the water', 'ISL');
  assert.deepEqual(thankRes.glosses, ['HELLO', 'THANK_YOU', 'WATER']);

  const negRes = speechToGloss('I do not want food', 'ISL');
  assert.deepEqual(negRes.glosses, ['ME', 'WANT', 'FOOD', 'NO']);
  assert.equal(negRes.facialCue, 'NEGATION');
});

test('glossToSentenceRuleBased applies facial grammar transforms in English and Hindi', () => {
  assert.equal(
    glossToSentenceRuleBased(['YOU', 'NAME', 'WHAT'], 'WH_QUESTION', 'en-IN'),
    'What is your name?'
  );
  assert.equal(
    glossToSentenceRuleBased(['YOU', 'NAME', 'WHAT'], 'WH_QUESTION', 'hi-IN'),
    'आपका नाम क्या है?'
  );
  assert.equal(
    glossToSentenceRuleBased(['YOU', 'GOOD'], 'POLAR_QUESTION', 'en-IN'),
    'Are you good?'
  );
  assert.equal(
    glossToSentenceRuleBased(['ME', 'WATER', 'WANT'], 'NEGATION', 'en-IN'),
    'I do not want water.'
  );
});

test('computeWER calculates exact substitutions, deletions, insertions, and WER score', () => {
  const exact = computeWER('What is your name?', 'What is your name');
  assert.equal(exact.wer, 0);
  assert.equal(exact.substitutions, 0);

  // 1 substitution out of 4 words -> WER = 0.25
  const oneSub = computeWER('please help me now', 'please assist me now');
  assert.equal(oneSub.wer, 0.25);
  assert.equal(oneSub.substitutions, 1);

  // 1 deletion + 1 insertion
  const mixed = computeWER('I want water please', 'I want cold water');
  assert.equal(mixed.refWords, 4);
  assert.ok(mixed.wer > 0 && mixed.wer <= 0.5);
});
