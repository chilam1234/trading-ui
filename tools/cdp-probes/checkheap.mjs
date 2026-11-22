import WebSocket from 'ws';
const ws = new WebSocket('ws://127.0.0.1:9223/devtools/page/629FE07B0AD64F3A005ACA1F51B489C1', { perMessageDeflate: false });
let nid = 0; const pending = new Map();
function send(method, params = {}) {
  return new Promise((res) => { const msg = { id: ++nid, method, params }; pending.set(msg.id, res); ws.send(JSON.stringify(msg)); });
}
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m); pending.delete(m.id); } });
ws.on('open', async () => {
  const r1 = await send('Runtime.evaluate', { expression:
    'JSON.stringify({m:(performance.memory.usedJSHeapSize/1048576).toFixed(1), dt:((Date.now()-performance.timeOrigin)/60000).toFixed(1)})',
    returnByValue: true });
  console.log('HEAP_NOW:' + r1.result?.value);
  process.exit(0);
});
ws.onerror = (e) => { console.log('WS_ERR', e.message || e); process.exit(1); };
ws.onclose = (e) => { console.log('WS_CLOSE', e.code); process.exit(1); };
setTimeout(() => { console.log('OPEN_TIMEOUT'); process.exit(1); }, 10000);
