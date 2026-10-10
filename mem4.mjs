import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:9223/devtools/page/8C73429F08EDBBC07D3624B5850E2DBF', { perMessageDeflate: false });
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
  for (let i = 0; i < 10; i++) {
    const r = await send('Runtime.evaluate', { expression:
      'JSON.stringify({heap: Math.round(performance.memory.usedJSHeapSize/1048576), dom: document.getElementsByTagName("*").length, hud: (document.body.innerText.match(/MSGS\/S (\d+)/)||[])[1], tr: (document.body.innerText.match(/TRADES\s*([\d,]+)/)||[])[1]})',
      returnByValue: true });
    console.log(r.result?.value ?? 'busy');
    await new Promise(r => setTimeout(r, 5000));
  }
  process.exit(0);
});
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 90000);
