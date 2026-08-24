// Probe: is CDP alive, and what does the app look like right now?
// Counts DOM <img> nodes + reads the folder/tab state. Read-only — clicks nothing.
import fs from 'node:fs';
import http from 'node:http';

const CDP = 'http://127.0.0.1:9223';

function get(url) {
  return new Promise((res, rej) => {
    http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); })
      .on('error', rej);
  });
}

const targets = JSON.parse(await get(`${CDP}/json`));
const page = targets.find(t => t.type === 'page' && t.url.includes('localhost:5173'));
if (!page) { console.log('NO_PAGE', targets.map(t => `${t.type}:${t.url}`).join(' | ')); process.exit(1); }

const ws = new (await import('ws')).default(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.on('message', m => {
  const d = JSON.parse(m);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
});
const send = (method, params = {}) => new Promise(res => {
  const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
});
await new Promise(r => ws.on('open', r));

const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  return r.result?.result?.value ?? r.result?.result?.description ?? JSON.stringify(r.result);
};

console.log('url     :', await evalJs('location.href'));
console.log('folder  :', await evalJs(`document.querySelector('[class*=surface] span')?.textContent ?? 'n/a'`));
console.log('imgs    :', await evalJs(`document.querySelectorAll('img').length`));
console.log('buttons :', await evalJs(`document.querySelectorAll('button').length`));
console.log('bodyText:', (await evalJs(`document.body.innerText.slice(0, 300)`)).replace(/\n/g, ' | '));
ws.close();
process.exit(0);