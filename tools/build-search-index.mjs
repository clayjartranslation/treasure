// Build-time semantic search index for ask.html (prototype). Usage: npm i @huggingface/transformers@3 && node tools/build-search-index.mjs .
// Build-time semantic index: one vector per paragraph (passage), int8-quantized.
import { pipeline } from '@huggingface/transformers';
import fs from 'fs'; import path from 'path';
const repo = process.argv[2], out = (process.env.OUT || path.join(repo, 'data/search'));
fs.mkdirSync(out, { recursive: true });
const cat = JSON.parse(fs.readFileSync(path.join(repo, 'data/books.json')));
const plain = (t) => t.replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
const passages = [];
for (const b of cat.books) {
  const f = path.join(repo, 'data/books', b.id + '.json'); if (!fs.existsSync(f)) continue;
  const book = JSON.parse(fs.readFileSync(f));
  for (const c of book.chapters) {
    const starts = (c.paras && c.paras.length ? c.paras : [1]);
    for (let i = 0; i < starts.length; i++) {
      const a = starts[i], z = (starts[i + 1] || 1e9) - 1;
      const vs = c.verses.filter((v) => v.v >= a && v.v <= z); if (!vs.length) continue;
      // split very long paragraphs into ~6-verse windows
      for (let k = 0; k < vs.length; k += 6) {
        const w = vs.slice(k, k + 6);
        const a0 = w[0].v, z0 = w[w.length - 1].v;
        const hk = Object.keys(c.subheads || {}).map(Number).filter((x) => x <= a0).sort((x, y) => y - x)[0];
        const head = hk ? c.subheads[hk] : '';
        const notes = (c.notes || []).filter((x) => { const v = +(String(x.ref).split(':')[1] || 0); return v >= a0 && v <= z0; }).map((x) => plain(x.text)).join(' ').slice(0, 400);
        passages.push({ b: book.id, n: book.name, c: c.n, a: a0, z: z0, h: head, t: (head ? head + '. ' : '') + w.map((v) => plain(v.text)).join(' ') + (notes ? ' Notes: ' + notes : '') });
      }
    }
  }
}
console.log('passages', passages.length);
const embed = await pipeline('feature-extraction', (process.env.M || 'Snowflake/snowflake-arctic-embed-s'), { dtype: 'q8' });
const D = 384, buf = new Int8Array(passages.length * D);
const B = 32;
for (let i = 0; i < passages.length; i += B) {
  const batch = passages.slice(i, i + B);
  const res = await embed(batch.map((p) => `${p.n} ${p.c}. ${p.t}`), { pooling: 'cls', normalize: true });
  const arr = res.data;
  for (let j = 0; j < batch.length; j++) for (let d = 0; d < D; d++) buf[(i + j) * D + d] = Math.max(-127, Math.min(127, Math.round(arr[j * D + d] * 127 / 0.25)));
  if (i % 640 === 0) console.log(i);
}
fs.writeFileSync(path.join(out, 'vectors.i8'), Buffer.from(buf.buffer));
fs.writeFileSync(path.join(out, 'passages.json'), JSON.stringify({ model: (process.env.M || 'Snowflake/snowflake-arctic-embed-s'), dim: D, scale: 0.25 / 127, items: passages.map(({ t, ...r }) => r) }));
console.log('done');
