// Shot of the Creative tab: dismiss any modal, click Creative, capture PNG.
import { writeFileSync } from 'node:fs';

const PORT = 9223;
const OUT = new URL('./creative_after.png', import.meta.url);

const list = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page' && t.url.includes('5173'));
if (!page) { console.error('no page target'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let msgId = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise(res => {
  const id = ++msgId;
  pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
};
await new Promise(r => { ws.onopen = r; });

const evalJs = async expression =>
  (await send('Runtime.evaluate', { expression, returnByValue: true }))?.result?.value;

console.log('modal:', await evalJs(`(() => {
  const close = document.querySelector('[aria-label="Close"]');
  if (close) { close.click(); return 'closed'; }
  return 'none';
})()`));

console.log('creative click:', await evalJs(`(() => {
  const t = [...document.querySelectorAll('[role=tab]')].find(b => /Creative/i.test(b.textContent));
  if (t) { t.click(); return 'clicked'; }
  return 'not found';
})()`));
await new Promise(r => setTimeout(r, 2000));

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
console.log('saved', OUT.href);
process.exit(0);