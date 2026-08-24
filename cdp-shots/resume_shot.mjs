// One-shot CDP driver: open the app, click "Resume" to restore the last
// session, wait for the contact sheet to fill, capture a PNG.
import { writeFileSync } from 'node:fs';

const PORT = 9223;
const OUT = new URL('./symmetry_grid.png', import.meta.url);

const list = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page');
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

// Click Resume (button whose text is exactly "Resume").
console.log('resume click:', await evalJs(`
  [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Resume')
    ? ([...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Resume').click(), 'clicked')
    : 'not found'
`));

// Wait for the contact sheet to populate with images.
for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 1000));
  const n = await evalJs(`document.querySelectorAll('.grid img').length`);
  console.log(`grid imgs: ${n}`);
  if (n > 0 && i >= 6) break; // let thumbs decode a few extra beats
}
await new Promise(r => setTimeout(r, 4000));

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
console.log('saved', OUT.pathname);
process.exit(0);
