import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { validateCorrection, applyCorrection } from '../lib/correction.ts';
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('@/') ? new URL('../' + specifier.slice(2) + '.ts', import.meta.url).href : specifier, context);
} });
const { POST } = await import('../app/api/ocr/review/route.ts');

test('unreadable image can never produce an applicable replacement', () => {
  assert.equal(validateCorrection({ status: 'uncertain', correctedText: '100万㌗', reason: '読めない' }, '10c万□').correctedText, '');
  assert.equal(validateCorrection({ status: 'same', correctedText: 'invented', reason: '' }, '原文').correctedText, '');
});
test('clear candidate preserves supplied characters and requires explicit application', () => {
  const current = '現行原発10c万\n第2課';
  const r = validateCorrection({ status: 'clear', correctedText: '現行原発100万', reason: '0の形が見える' }, '現行原発10c万');
  assert.equal(current, '現行原発10c万\n第2課');
  assert.equal(applyCorrection(current, current, '現行原発10c万', r.correctedText), '現行原発100万\n第2課');
});
test('stale, missing, or repeated text cannot be silently replaced', () => {
  assert.equal(applyCorrection('手で直した文章', '元の文章', '文章', '文'), null);
  assert.equal(applyCorrection('第2課 第2課', '第2課 第2課', '第2課', '第2弾'), null);
  assert.equal(applyCorrection('元の文章', '元の文章', 'ない', 'ある'), null);
  assert.equal(applyCorrection('a'.repeat(5000), 'a'.repeat(5000), 'a'.repeat(5000), 'b'.repeat(5001)), null);
});
test('reject malformed or expanded/hallucinated full paragraphs', () => {
  assert.throws(() => validateCorrection({ status: 'clear', correctedText: '説明'.repeat(100), reason: '' }, '㌗'));
  assert.throws(() => validateCorrection({ status: 'clear', correctedText: 'a\nb', reason: '' }, 'a'));
  assert.throws(() => validateCorrection(null, 'a'));
});
test('review endpoint validates payload and sends only selected crop for review', async (t) => {
  const oldFetch = globalThis.fetch; t.after(() => { globalThis.fetch = oldFetch; });
  process.env.OPENAI_API_KEY = 'test-only';
  const request = (body) => new Request('https://example.com/api/ocr/review', { method: 'POST', body: JSON.stringify(body) });
  globalThis.fetch = async () => { assert.fail('bad input must not contact OpenAI'); };
  assert.equal((await POST(request({ imageDataUrl: 'https://arbitrary', originalText: 'x' }))).status, 400);
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    assert.equal(body.input[1].content[0].image_url, 'data:image/png;base64,AAAA');
    assert.ok(options.signal);
    return Response.json({ output_text: JSON.stringify({ status: 'uncertain', correctedText: '推測の文字', reason: 'ぼやけています' }) });
  };
  const response = await POST(request({ imageDataUrl: 'data:image/png;base64,AAAA', originalText: '判定不可' }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).correctedText, '');
  assert.equal(calls, 1);
});
test('raw transcript and duplicate review panel are removed; image selection remains', () => {
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const editor = readFileSync(new URL('../app/article-editor.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /整理前の読み取り結果を見る|setRawOCR/);
  assert.match(page, /<ArticleEditor/);
  assert.doesNotMatch(editor, /気になる文字を確認する|AIにこの画像を確認してもらう/);
  assert.match(editor, /setSelectionRange/);
});
