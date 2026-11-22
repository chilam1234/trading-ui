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
  for (let i = 0; i < 12; i++) {
    const perf = await send('Runtime.evaluate', { expression:
      'JSON.stringify({heap: performance.memory.usedJSHeapSize, dom: document.getElementsByTagName("*").length, tapeRows: document.querySelectorAll("table tbody tr").length, svg: document.querySelectorAll("canvas").length})',
      returnByValue: true });
    try { console.log(perf.result.value); } catch { console.log(JSON.stringify(perf).slice(0,150)); }
    await new Promise(r => setTimeout(r, 5000));
  }
  process.exit(0);
});
