// CDP screenshot rig — drives a dedicated Chrome instance through the app's
// main states and captures a PNG at each one.
const WebSocket = require('ws');
const fs = require('fs');
const http = require('http');

const OUT = __dirname;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function getTarget() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9223/json', res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const targets = JSON.parse(d).filter(t => t.type === 'page');
        resolve(targets[0]);
      });
    }).on('error', reject);
  });
}

let id = 0;
function send(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    const onMsg = raw => {
      const m = JSON.parse(raw);
      if (m.id === msgId) { ws.off('message', onMsg); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
    };
    ws.on('message', onMsg);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

async function shot(ws, name) {
  const { data } = await send(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, 'base64'));
  console.log('saved', name);
}

async function clickButton(ws, text) {
  await send(ws, 'Runtime.evaluate', { expression: `
    (() => {
      const btns = [...document.querySelectorAll('button')];
      const b = btns.find(b => b.textContent.trim().toLowerCase().includes(${JSON.stringify(text)}.toLowerCase()));
      if (b) { b.click(); return 'clicked: ' + b.textContent.trim(); }
      return 'NOT FOUND';
    })()` , returnByValue: true });
}

async function main() {
  const target = await getTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 100 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));

  await send(ws, 'Page.enable');
  await send(ws, 'Runtime.enable');
  await send(ws, 'Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });

  // 1 — welcome hero
  await sleep(2500);
  await shot(ws, '1_welcome');

  // 2 — resume the catalog → gallery grid
  await clickButton(ws, 'Resume');
  await sleep(4000);
  await shot(ws, '2_gallery');

  // 3 — loupe view (click first film thumb / select)
  await send(ws, 'Runtime.evaluate', { expression: `
    (() => {
      const el = document.querySelector('[data-sel="1"]') || document.querySelector('img');
      if (el) el.click();
      return el ? 'clicked thumb' : 'no thumb';
    })()`, returnByValue: true });
  await sleep(2500);
  await shot(ws, '3_loupe');

  ws.close();
  process.exit(0);
}

main().catch(e => { console.error('FAIL', e.message); process.exit(1); });
