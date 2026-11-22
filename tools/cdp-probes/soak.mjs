import WebSocket from 'ws';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const ws = new WebSocket('ws://localhost:9223/devtools/page/629FE07B0AD64F3A005ACA1F51B489C1', { perMessageDeflate: false });
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
  await send('Page.navigate', { url: 'http://localhost:5173' }); 
  await new Promise(r2 => setTimeout(r2, 12000));
  const fs = require('fs');
  for (let i = 0; i < 75; i++) {
    let r3;
    try {
      r3 = await send('Runtime.evaluate', { expression:
        'JSON.stringify({m:(performance.memory.usedJSHeapSize/1048576).toFixed(1), t:(document.body.innerText.match(/TRADES\\s*([\\d,]+)/)||[])[1], s:(document.body.innerText.match(/MSGS\\/S (\\d+)/)||[])[1]})',
        returnByValue: true, timeout: 8000 });
    } catch (e) { fs.appendFileSync('/tmp/soak.jsonl', JSON.stringify({i, err: String(e)})+'\n'); continue; }
    fs.appendFileSync('/tmp/soak.jsonl', JSON.stringify({i, v: r3.result?.value ?? 'busy'})+'\n');
    await new Promise(r2 => setTimeout(r2, 120000));
  }
  process.exit(0);
});
setTimeout(() => { process.exit(1); }, 1000*60*160);
