import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:9223/devtools/page/629FE07B0AD64F3A005ACA1F51B489C1', { perMessageDeflate: false });
let nid = 0; const pending = new Map();
function send(method, params = {}) {
  return new Promise((res) => { const msg = { id: ++nid, method, params }; pending.set(msg.id, res); ws.send(JSON.stringify(msg)); });
}
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m); pending.delete(m.id); } });
ws.on('open', async () => {
  for (let k = 0; k < 5; k++) {
    const r = await send('Runtime.evaluate', { expression:
      'JSON.stringify({m:(performance.memory.usedJSHeapSize/1048576).toFixed(1), dt:((Date.now()-performance.timeOrigin)/60000).toFixed(1), msg:document.body.innerText.match(/MSGS\/S (\d+)/)?.[1]})',
      returnByValue: true });
    console.log('S', r.result?.value);
    await new Promise(r2 => setTimeout(r2, 5000));
  }
  process.exit(0);
});
setTimeout(() => { console.log('TO'); process.exit(1); }, 60000);
