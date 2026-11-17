// PROTOTYPE: on-device semantic search + optional on-device AI explanation.
// Nothing typed here leaves the device. Model files are downloaded once (from Hugging Face) and cached by the browser.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plain = (t) => t.replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
const params = new URLSearchParams(location.search);
const status = (t) => { $('#status').textContent = t; };

// ---------- 1. Semantic search (works in every modern browser via WebAssembly) ----------
let meta, vecs, embedder;
const bookCache = new Map();
async function loadIndex() {
  if (meta) return;
  status('Loading the search index…');
  const [m, v] = await Promise.all([
    fetch('data/search/passages.json').then((r) => r.json()),
    fetch('data/search/vectors.i8').then((r) => r.arrayBuffer()),
  ]);
  meta = m; vecs = new Int8Array(v);
}
async function loadEmbedder() {
  if (embedder) return embedder;
  status('Getting the meaning-search model ready (about 34 MB, first time only)…');
  const T = await import('./vendor/transformers.min.js');
  T.env.allowLocalModels = false;
  T.env.backends.onnx.wasm.wasmPaths = new URL('./vendor/', import.meta.url).href;
  embedder = await T.pipeline('feature-extraction', meta.model, { dtype: 'q8', device: 'wasm' });
  return embedder;
}
async function book(id) {
  if (!bookCache.has(id)) bookCache.set(id, fetch(`data/books/${id}.json`).then((r) => r.json()));
  return bookCache.get(id);
}
async function passageText(p) {
  const b = await book(p.b);
  const ch = b.chapters.find((c) => c.n === p.c);
  return ch.verses.filter((v) => v.v >= p.a && v.v <= p.z).map((v) => ({ v: v.v, t: plain(v.text) }));
}
const refOf = (p) => `${p.n} ${p.c}:${p.a}${p.z > p.a ? '–' + p.z : ''}`;
// Keyword (BM25) ranking, fused with meaning ranking (reciprocal rank fusion) for sturdier results.
const STOP = new Set('a an the and or of to in on for with by from at is are was were be been it its this that these those who whom what why how when where did do does i me my you your he him his she her they them their we us our s'.split(' '));
const tok = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, ''));
let kw;
async function keywordIndex() {
  if (kw) return kw;
  const docs = await Promise.all(meta.items.map(async (p) => tok((p.h || '') + ' ' + (await passageText(p)).map((v) => v.t).join(' '))));
  const df = new Map(); docs.forEach((d) => new Set(d).forEach((w) => df.set(w, (df.get(w) || 0) + 1)));
  kw = { docs, df, avg: docs.reduce((a, d) => a + d.length, 0) / docs.length };
  return kw;
}
function bm25(q) {
  const qt = tok(q), N = kw.docs.length;
  return kw.docs.map((d) => { let s = 0; for (const t of qt) { let f = 0; for (const w of d) if (w === t) f++; if (!f) continue; const n = kw.df.get(t); s += Math.log(1 + (N - n + 0.5) / (n + 0.5)) * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * d.length / kw.avg)); } return s; });
}
async function search(q, k = 6) {
  await loadIndex();
  const emb = await loadEmbedder();
  status('Searching by meaning…');
  const out = await emb('Represent this sentence for searching relevant passages: ' + q, { pooling: 'cls', normalize: true });
  const qv = out.data, D = meta.dim, n = meta.items.length, scores = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; const o = i * D; for (let d = 0; d < D; d++) s += qv[d] * vecs[o + d]; scores[i] = s * meta.scale; }
  await keywordIndex();
  const kws = bm25(q);
  const rank = (arr) => { const r = new Array(n); [...arr.keys()].sort((a, b) => arr[b] - arr[a]).forEach((i, j) => { r[i] = j; }); return r; };
  const rs = rank(scores), rk = rank(kws);
  const fused = new Float32Array(n); for (let i = 0; i < n; i++) fused[i] = 1 / (60 + rs[i]) + (kws[i] > 0 ? 1 / (60 + rk[i]) : 0);
  const idx = [...fused.keys()].sort((a, b) => fused[b] - fused[a]).slice(0, k);
  return Promise.all(idx.map(async (i) => ({ ...meta.items[i], score: scores[i], verses: await passageText(meta.items[i]) })));
}

// ---------- 2. Pick the smartest AI this device can run on its own ----------
const isApple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isMobile = isApple || /Android|Mobile/i.test(navigator.userAgent);
const MODELS = {
  // Tested on Nov 17, 2026: Qwen3 0.6B kept to the passages and cited verses; Gemma 3 1B mixed up facts.
  phone: { id: 'Qwen3-0.6B-q4f16_1-MLC', name: 'Qwen3 0.6B', mb: 350, ctx: 2048 },
  mid: { id: 'Qwen3-1.7B-q4f16_1-MLC', name: 'Qwen3 1.7B', mb: 1100, ctx: 2048 },
  desktop: { id: 'Qwen3-4B-q4f16_1-MLC', name: 'Qwen3 4B', mb: 2263, ctx: 4096 },
};
async function pickEngine() {
  if (params.get('engine') === 'none') return { kind: 'none', why: 'This phone can’t run the AI helper, so you get meaning search only. The passages below are the full answer from the Bible text.' };
  // a) Chrome/Edge desktop built-in Gemini Nano: nothing for us to download, runs locally.
  try {
    if ('LanguageModel' in self) {
      const a = await self.LanguageModel.availability({ expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] });
      if (a !== 'unavailable') return { kind: 'nano', name: 'Gemini Nano (built into your browser)', mb: a === 'available' ? 0 : null };
    }
  } catch { /* fall through */ }
  // b) WebGPU: WebLLM with a model sized to the device.
  if (navigator.gpu) {
    try {
      const ad = await navigator.gpu.requestAdapter();
      if (ad) {
        const f16 = ad.features.has('shader-f16');
        const mem = navigator.deviceMemory || (isMobile ? 4 : 8); // Safari doesn't report; assume conservative
        const big = ad.limits.maxBufferSize >= 1 << 30 && ad.limits.maxStorageBufferBindingSize >= 1 << 30;
        let m = isMobile ? MODELS.phone : (mem >= 8 && big ? MODELS.desktop : MODELS.mid);
        if (isMobile && mem >= 8 && !isApple) m = MODELS.mid; // high-end Android
        m = { ...m, id: f16 ? m.id : m.id.replace('q4f16_1', 'q4f32_1') };
        return { kind: 'webllm', ...m };
      }
    } catch { /* fall through */ }
  }
  // c) No WebGPU: desktop CPUs can run a small model with WebAssembly (wllama, planned); phones get search-only.
  if (!isMobile && (navigator.hardwareConcurrency || 2) >= 4) return { kind: 'wasm', name: 'Gemma 3 1B (CPU, slower)', mb: 800, planned: true };
  return { kind: 'none', why: 'This device can’t run the AI helper, but meaning search works fully.' };
}

// ---------- 3. Grounded prompt + citation check ----------
const SYSTEM = 'You are a careful Bible study helper for the Clay Jar Treasure Bible. Explain in your own simple words (do not just copy the verses), using ONLY the passages given. ' +
  'After each sentence, cite the verse in square brackets, like [Genesis 9:11]. If the passages do not answer the question, say so plainly. ' +
  'Do not add outside facts, doctrine, or opinions. Do not give medical, legal, financial, or personal advice. Use 3 to 5 short sentences.';
function buildPrompt(q, hits) {
  const ctx = hits.map((h) => `${refOf(h)}\n` + h.verses.map((v) => `${h.c}:${v.v} ${v.t}`).join(' ')).join('\n\n');
  return `Passages from the Clay Jar Treasure Bible:\n\n${ctx}\n\nQuestion: ${q}`;
}
function linkCitations(text, hits) {
  // Only references inside the retrieved passages become links; anything else is flagged.
  return esc(text).replace(/\[([1-3]?\s?[A-Z][a-z]+(?: [A-Z][a-z]+)*) (\d+):(\d+)(?:[–-](\d+))?\]/g, (m, bk, c, v) => {
    const h = hits.find((x) => x.n === bk && x.c === +c && +v >= x.a && +v <= x.z);
    return h ? `<a class="cite" href="./#/read/${encodeURIComponent(h.b)}/${c}/${v}">[${bk} ${c}:${v}]</a>` : `<span title="Not in the passages shown; check it yourself">[${bk} ${c}:${v}?]</span>`;
  });
}
let engineObj = null;
async function explain(engine, q, hits, onToken) {
  const user = buildPrompt(q, hits);
  if (engine.kind === 'nano') {
    const s = await self.LanguageModel.create({ initialPrompts: [{ role: 'system', content: SYSTEM }] });
    let acc = ''; for await (const ch of s.promptStreaming(user)) { acc += ch; onToken(acc); } return acc;
  }
  if (engine.kind === 'webllm') {
    const W = await import('./vendor/web-llm.js');
    if (!engineObj) engineObj = await W.CreateMLCEngine(engine.id, {
      initProgressCallback: (p) => status(`Downloading AI model once (${engine.mb} MB): ${Math.round(p.progress * 100)}%`),
    }, { context_window_size: engine.ctx });
    const stream = await engineObj.chat.completions.create({ stream: true, temperature: 0.2, max_tokens: 260,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user + (engine.id.startsWith('Qwen3') ? ' /no_think' : '') }] });
    let acc = ''; for await (const c of stream) { acc += c.choices[0]?.delta?.content || ''; onToken(acc.replace(/<think>[\s\S]*?<\/think>/g, '')); } return acc;
  }
  throw new Error('No on-device AI on this device');
}

// ---------- 4. UI ----------
function renderHits(hits) {
  $('#results').innerHTML = hits.map((h) => `<li><a class="ref" href="./#/read/${encodeURIComponent(h.b)}/${h.c}/${h.a}">${esc(refOf(h))}</a>
    <span class="txt">${h.verses.map((v) => `<sup>${v.v}</sup>${esc(v.t)}`).join(' ')}</span></li>`).join('');
}
function aiCard(inner) { $('#ai').innerHTML = `<section class="ai-card" aria-live="polite">${inner}</section>`; }
async function run(q) {
  const t0 = performance.now();
  const hits = await search(q);
  renderHits(hits);
  status(`${hits.length} passages that match your question by meaning (${((performance.now() - t0) / 1000).toFixed(1)} s, on your device).`);
  if (params.get('demo')) {
    const d = await fetch('ai-preview-sample.json').then((r) => r.json());
    aiCard(`<h2>✨ Short explanation</h2><div class="answer">${linkCitations(d.answer, hits)}</div><div class="engine">Recorded test: ${esc(d.engine)} running locally, answering only from the passages below.</div>`);
    return;
  }
  const engine = await pickEngine();
  if (engine.kind === 'none' || engine.planned) {
    aiCard(`<h2>Passages for your question</h2><div class="engine">${esc(engine.kind === 'none' ? engine.why : 'AI on this computer’s CPU is coming in the full version. Meaning search works fully.')}</div>`);
    return;
  }
  const size = engine.mb ? `a one-time ${engine.mb} MB download (Wi-Fi recommended)` : 'no extra download';
  aiCard(`<h2>✨ Want a short explanation?</h2><div class="engine">Uses ${esc(engine.name)} on your device, ${size}. Your question stays on your device.</div><p><button class="btn" id="goAI" type="button">Explain these passages</button></p>`);
  $('#goAI').addEventListener('click', async () => {
    aiCard('<h2>✨ Short explanation</h2><div class="answer" id="ans">Thinking…</div>');
    try {
      const final = await explain(engine, q, hits, (t) => { $('#ans').textContent = t; });
      const clean = final.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      $('#ans').innerHTML = linkCitations(clean, hits) + (/\[[^\]]+\d+:\d+/.test(clean) ? '' : `<p class="engine">Based on: ${hits.slice(0, 3).map(refOf).map(esc).join('; ')}</p>`);
      status('Done. AI can make mistakes; check the verses below.');
    } catch (e) {
      aiCard(`<h2>Passages for your question</h2><div class="engine">The AI helper couldn’t start on this device (${esc(e.message || e)}). Meaning search still works.</div>`);
    }
  });
}
$('#askForm').addEventListener('submit', (e) => { e.preventDefault(); const q = $('#q').value.trim(); if (q.length > 2) run(q).catch((err) => status('Something went wrong: ' + err.message)); });
if (params.get('q')) { $('#q').value = params.get('q'); run(params.get('q')).catch((err) => status('Something went wrong: ' + err.message)); }
