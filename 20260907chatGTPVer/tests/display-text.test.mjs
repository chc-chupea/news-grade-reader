import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDisplayText, normalizeGeneratedResult } from '../lib/display-text.ts';

test('generated line breaks become spaces for natural wrapping', () => {
  assert.equal(normalizeDisplayText('一文。\\n次の文。'), '一文。 次の文。');
  assert.equal(normalizeDisplayText('一文。\\r\\n次の文。'), '一文。 次の文。');
  assert.equal(normalizeDisplayText('一文。\\\\n次の文。'), '一文。 次の文。');
  assert.equal(normalizeDisplayText('一文。\n\n次の文。'), '一文。 次の文。');
});
test('normalize every generated display field without mutating source', () => {
  const source = { body: '本文\\n続き', words: [['語', '意味\\n説明']], quiz: [{ answer: '答え\\n補足' }] };
  const result = normalizeGeneratedResult(source);
  assert.equal(result.body, '本文 続き');
  assert.equal(result.words[0][1], '意味 説明');
  assert.equal(result.quiz[0].answer, '答え 補足');
  assert.equal(source.body, '本文\\n続き');
  assert.equal(normalizeDisplayText('100万㌗、第2弾。'), '100万㌗、第2弾。');
});
