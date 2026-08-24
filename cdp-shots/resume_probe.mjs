// Resume the dropped session, then report state. Clicks ONLY the Resume button.
import http from 'node:http';

const CDP = 'http://127.0.0.1:9223';
function get(url) {
  return new Promise((res, rej) => {
    http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }).on('error', rej);
  });
}
const targets = JSON.parse(await get(`${CDP}/json`));
const page = targets.find(t => t.type === 'page' && t.url.includes('localhost:5173'));
if (!page) { console.log('NO_PAGE'); process.exit(1); }
const ws = new (await import('ws')).default(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.on('message', m => { const d = JSON.parse(m); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise(r => ws.on('open', r));
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value ?? null;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const clicked = await evalJs(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Resume');
  if (!btn) return 'NO_RESUME';
  btn.click(); return 'CLICKED';
})()`);
console.log('resume:', clicked);

// wait for the catalog to load
for (let i = 0; i < 30; i++) {
  await sleep(2000);
  const imgs = await evalJs(`document.querySelectorAll('img').length`);
  const txt = await evalJs(`document.body.innerText.slice(0, 200)`);
  console.log(`t=${(i+1)*2}s imgs=${imgs} :: ${String(txt).replace(/\n/g, ' | ').slice(0, 140)}`);
  if (imgs > 0) break;
}
console.log('final imgs:', await evalJs(`document.querySelectorAll('img').length`));
console.log('tabs:', await evalJs(`[...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => t && t.length < 24).slice(0, 30).join(' | ')`));
ws.close(); process.exit(0);