import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:9223/devtools/page/ACC9651A1196C172B0084C243188EA90', { perMessageDeflate: false });
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((res) => {
    const msg = { id: ++id, method, params };
    pending.set(msg.id, res);
    ws.send(JSON.stringify(msg));
  });
}
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m); pending.delete(m.id); }
});
ws.on('open', async () => {
  const r = await send('Runtime.evaluate', { expression:
    'JSON.stringify({ conn: window.__CONNECTION_STATE__ ?? "n/a", tapeChildren: document.querySelectorAll("[data-tape] tbody tr, .tape tbody tr").length, anyTable: document.querySelectorAll("table").length, texts: document.body.innerText.slice(0, 400) })',
    returnByValue: true });
  console.log(r.result?.value ?? JSON.stringify(r).slice(0,300));
  process.exit(0);
});
