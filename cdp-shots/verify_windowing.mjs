// Verify windowing: resume session if dropped, then Creative tab + loupe filmstrip img counts.
import http from 'node:http';
const CDP = 'http://127.0.0.1:9223';
function get(url) { return new Promise((res, rej) => { http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }).on('error', rej); }); }
const targets = JSON.parse(await get(`${CDP}/json`));
const page = targets.find(t => t.type === 'page' && t.url.includes('localhost:5173'));
if (!page) { console.log('NO_PAGE'); process.exit(1); }
const ws = new (await import('ws')).default(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.on('message', m => { const d = JSON.parse(m); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise(r => ws.on('open', r));
const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.result?.value ?? null; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const snap = async (label) => {
  const imgs = await evalJs(`document.querySelectorAll('img').length`);
  const btns = await evalJs(`document.querySelectorAll('button').length`);
  console.log(`${label}: imgs=${imgs} buttons=${btns}`);
};

// ── resume if at the welcome screen ──
const at = await evalJs(`document.body.innerText.includes('Pick up where you left off')`);
if (at) {
  console.log('resuming session…');
  await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Resume'); if (b) b.click(); return !!b; })()`);
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const n = await evalJs(`document.querySelectorAll('img').length`);
    const done = await evalJs(`!document.body.innerText.includes('Pick up where you left off')`);
    if (done && n > 0) break;
  }
}
console.log('catalog:', String(await evalJs(`document.body.innerText.slice(0, 120)`)).replace(/\n/g, ' | '));
await snap('GALLERY   ');

// ── Creative tab ──
await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Creative'); if (b) b.click(); return !!b; })()`);
await sleep(2500);
await snap('CREATIVE  ');
console.log('creative text:', String(await evalJs(`document.body.innerText.slice(0, 380)`)).replace(/\n/g, ' | '));

// ── back to gallery, enter loupe (filmstrip) ──
await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Gallery'); if (b) b.click(); return !!b; })()`);
await sleep(1200);
await evalJs(`(() => { const b = document.querySelector('[class*=grid] button'); if (b) b.click(); return !!b; })()`);
await sleep(800);
await evalJs(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }))`);
await sleep(2000);
await snap('LOUPE     ');
console.log('loupe text:', String(await evalJs(`document.body.innerText.slice(0, 240)`)).replace(/\n/g, ' | '));
ws.close(); process.exit(0);