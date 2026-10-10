import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:9223/devtools/page/9DE5BB61A5FD7C00217859BA1843484D', { perMessageDeflate: false });
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
  await send('Page.navigate', { url: 'http://localhost:4173' });
  await new Promise(r2 => setTimeout(r2, 12000));
  for (let i = 0; i < 5; i++) {
    const r = await send('Runtime.evaluate', { expression:
      'JSON.stringify({perf: (performance.memory.usedJSHeapSize/1048576).toFixed(1), hud: document.body.innerText.match(/MSGS\\/S (\\d+)/)?.[1], tr: document.body.innerText.match(/TRADES\\s*([\\d,]+)/)?.[1]})',
      returnByValue: true });
    console.log(r.result?.value ?? 'busy');
    await new Promise(r2 => setTimeout(r2, 4000));
  }
  process.exit(0);
});
setTimeout(() => { console.log('t/o'); process.exit(1); }, 90000);
