// Run on Node 24: node --test tests/ndlocr.test.mjs
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) return nextResolve(new URL('../' + specifier.slice(2) + '.ts', import.meta.url).href, context);
  return nextResolve(specifier, context);
} });
const { extractRegions, assembleArticle, cloudRunToken } = await import('../lib/ndlocr.ts');
const { POST } = await import('../app/api/ocr/route.ts');
const line = (text, vertical = 'true') => ({ text, boundingBox: [[10, 20], [10, 80], [30, 20], [30, 80]], isVertical: vertical, isTextline: 'true', confidence: .9 });
test('NDLOCR nested lines retain repeated words, numbers, and string booleans', () => {
  const regions = extractRegions({ contents: [[line('5500億ドル'), line('5500億ドル', 'false')]] });
  assert.equal(regions.length, 2);
  assert.equal(regions[0].direction, 'vertical');
  assert.equal(regions[1].direction, 'horizontal');
  assert.equal(regions[0].width, 20);
  assert.equal(regions[0].height, 60);
  assert.notEqual(regions[0].id, regions[1].id);
});
test('layout cannot replace OCR characters or silently omit or duplicate lines', () => {
  const regions = extractRegions([line('原文5500'), line('氏名□'), line('広告')]);
  const plan = { orderedIds: ['line-2', 'line-1'], excluded: [{ id: 'line-3', reason: '広告' }], uncertainIds: ['line-2'] };
  const result = assembleArticle(regions, plan);
  assert.equal(result.text, '氏名□\n原文5500');
  assert.deepEqual(result.uncertainSegments, ['氏名□']);
  assert.match(result.excludedElements[0], /広告/);
  assert.throws(() => assembleArticle(regions, { ...plan, excluded: [] }));
  assert.throws(() => assembleArticle(regions, { ...plan, orderedIds: ['line-1', 'line-1'] }));
  assert.throws(() => assembleArticle(regions, { ...plan, orderedIds: ['made-up', 'line-1'] }));
});
test('invalid/non-text boxes do not produce invented position data', () => {
  assert.deepEqual(extractRegions([{ ...line('skip'), isTextline: 'false' }, { ...line('invalid'), boundingBox: [[null, 1]] }]), []);
});

test('authenticated OCR flow, failures, and non-disclosure', async (t) => {
  process.env.GCP_WORKLOAD_IDENTITY_PROVIDER = 'projects/777213674523/locations/global/workloadIdentityPools/vercel-ndlocr/providers/vercel';
  process.env.GCP_SERVICE_ACCOUNT_EMAIL = 'ndlocr-vercel@endless-grail-508102-g7.iam.gserviceaccount.com';
  process.env.NDLOCR_API_URL = 'https://ndlocr-server-777213674523.asia-northeast1.run.app';
  process.env.NDLOCR_API_KEY = 'x'.repeat(40);
  process.env.VERCEL = '1';
  const bytes = Buffer.from([137, 80, 78, 71]);
  const request = (input = { imageDataUrls: ['data:image/png;base64,' + bytes.toString('base64')] }) => new Request('https://example.com/api/ocr', { method: 'POST', headers: { 'x-vercel-oidc-token': 'test-oidc' }, body: JSON.stringify(input) });
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  await t.test('STS then ID token then exact raw bytes, no token or server path in response', async () => {
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push(url);
      if (calls.length === 1) {
        assert.equal(url, 'https://sts.googleapis.com/v1/token');
        assert.equal(options.headers.Authorization, undefined);
        assert.equal(options.body.get('subject_token'), 'test-oidc');
        assert.equal(options.body.get('audience'), '//iam.googleapis.com/' + process.env.GCP_WORKLOAD_IDENTITY_PROVIDER);
        return Response.json({ access_token: 'test-access' });
      }
      if (calls.length === 2) {
        assert.match(url, /projects\/-\/serviceAccounts\/.+:generateIdToken$/);
        assert.equal(options.headers.Authorization, 'Bearer test-access');
        assert.equal(JSON.parse(options.body).audience, process.env.NDLOCR_API_URL);
        return Response.json({ token: 'test-id' });
      }
      assert.equal(url, process.env.NDLOCR_API_URL + '/ocr');
      assert.equal(options.headers.Authorization, 'Bearer test-id');
      assert.equal(options.headers['X-OCR-Key'], 'x'.repeat(40));
      assert.deepEqual(options.body, bytes);
      assert.equal(options.redirect, 'error');
      return Response.json({ text: '原文5500', raw_ocr: { contents: [[line('原文5500')]], imginfo: { img_path: '/tmp/private' } }, image: { width: 100, height: 200 }, elapsed_seconds: 17 });
    };
    const response = await POST(request());
    const output = await response.text();
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(output).text, '原文5500');
    assert.equal(calls.length, 3);
    assert.doesNotMatch(output, /test-id|test-access|private|xxxxxxxx/);
  });
  await t.test('reject invalid image before contacting Google', async () => {
    globalThis.fetch = async () => { assert.fail('must not contact Google'); };
    assert.equal((await POST(request({ imageDataUrls: ['https://untrusted/image'] }))).status, 400);
    assert.equal((await POST(request({ imageDataUrls: ['data:image/png;base64,AAAA', 'data:image/png;base64,AAAA'] }))).status, 400);
  });
  await t.test('missing runtime token never uses stale production environment token', async () => {
    process.env.VERCEL_OIDC_TOKEN = 'expired-build-token';
    await assert.rejects(cloudRunToken(new Request('https://example.com'), process.env.NDLOCR_API_URL), /Vercel/);
  });
  await t.test('STS failure is sanitized and stops before OCR', async () => {
    let count = 0;
    globalThis.fetch = async () => { count++; return Response.json({ error: 'secret-value' }, { status: 403 }); };
    const response = await POST(request());
    assert.equal(response.status, 503);
    assert.equal(count, 1);
    assert.doesNotMatch(await response.text(), /secret-value/);
  });
  for (const status of [401, 403, 429, 504]) await t.test('OCR HTTP ' + status, async () => {
    let count = 0;
    globalThis.fetch = async () => {
      count++;
      if (count === 1) return Response.json({ access_token: 'access' });
      if (count === 2) return Response.json({ token: 'id' });
      return new Response('private upstream details', { status });
    };
    const response = await POST(request());
    assert.equal(response.status, status === 401 || status === 403 ? 502 : status);
    assert.doesNotMatch(await response.text(), /private upstream/);
  });
});
