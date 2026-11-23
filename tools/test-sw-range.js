const assert = require('assert');
const { parseRange, sliceRangeResponse } = require('../js/range-response.js');

const size = 1000;
assert.deepStrictEqual(parseRange('bytes=0-99', size), { start: 0, end: 99, size: 1000 });
assert.deepStrictEqual(parseRange('bytes=500-', size), { start: 500, end: 999, size: 1000 });
assert.deepStrictEqual(parseRange('bytes=-100', size), { start: 900, end: 999, size: 1000 });
assert.ok(parseRange('bytes=1000-1100', size).unsatisfiable);
assert.strictEqual(parseRange('', size), null);

const body = Buffer.alloc(1000, 7);
body[0] = 1;
body[99] = 2;
body[500] = 3;

async function run() {
  const full = new Response(body, { status: 200, headers: { 'Content-Type': 'audio/opus', 'Content-Length': '1000' } });
  const ranged = new Request('https://example.com/audio.opus', { headers: { Range: 'bytes=0-99' } });
  const partial = await sliceRangeResponse(ranged, full);
  assert.strictEqual(partial.status, 206);
  assert.strictEqual(partial.headers.get('Content-Range'), 'bytes 0-99/1000');
  assert.strictEqual(partial.headers.get('Content-Length'), '100');
  assert.strictEqual(partial.headers.get('Accept-Ranges'), 'bytes');
  const buf = Buffer.from(await partial.arrayBuffer());
  assert.strictEqual(buf.length, 100);
  assert.strictEqual(buf[0], 1);
  assert.strictEqual(buf[99], 2);

  const midReq = new Request('https://example.com/audio.opus', { headers: { Range: 'bytes=500-500' } });
  const mid = await sliceRangeResponse(midReq, new Response(body, { status: 200 }));
  assert.strictEqual(mid.status, 206);
  assert.strictEqual(mid.headers.get('Content-Range'), 'bytes 500-500/1000');
  const midBuf = Buffer.from(await mid.arrayBuffer());
  assert.strictEqual(midBuf.length, 1);
  assert.strictEqual(midBuf[0], 3);

  const bad = await sliceRangeResponse(
    new Request('https://example.com/audio.opus', { headers: { Range: 'bytes=2000-2001' } }),
    new Response(body, { status: 200 })
  );
  assert.strictEqual(bad.status, 416);
  assert.strictEqual(bad.headers.get('Content-Range'), 'bytes */1000');

  const untouched = await sliceRangeResponse(new Request('https://example.com/audio.opus'), new Response(body, { status: 200 }));
  assert.strictEqual(untouched.status, 200);
  console.log('sw-range tests ok');
}

run().catch((err) => { console.error(err); process.exit(1); });
