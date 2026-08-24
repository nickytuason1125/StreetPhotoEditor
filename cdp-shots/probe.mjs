// Probe: what is actually on screen in the app target right now?
const list = await (await fetch('http://localhost:9223/json/list')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('5173'));
if (!page) { console.error('no 5173 target'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
await new Promise(r => { ws.onopen = r; });

const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  return r?.result?.value ?? ('(exception: ' + JSON.stringify(r?.exceptionDetails)?.slice(0, 300) + ')');
};

console.log('URL:', await ev('location.href'));
console.log('READY:', await ev('document.readyState'));
console.log('BODY:', JSON.stringify(await ev('document.body.innerText.slice(0, 500)')));
console.log('TABS:', JSON.stringify(await ev("[...document.querySelectorAll('[role=tab]')].map(b => b.textContent.trim())")));
console.log('BTNS:', JSON.stringify(await ev("[...document.querySelectorAll('button')].map(b => b.textContent.trim()).slice(0, 25)")));
process.exit(0);