import WebSocket from 'ws';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
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
  await send('Page.enable');
  await send('Profiler.enable');
  await send('Profiler.setSamplingInterval', { interval: 1000 });
  await send('Profiler.start');
  await send('Page.navigate', { url: 'http://localhost:4173' });
  await new Promise(r => setTimeout(r, 25000));
  const stop = await send('Profiler.stop');
  const prof = stop.profile ?? stop.result?.profile;
  fs.writeFileSync('/tmp/cpu-profile.json', JSON.stringify(prof));
  console.log('profile saved, nodes:', prof ? prof.nodes.length : 'NONE', JSON.stringify(stop).slice(0,120));
  process.exit(0);
});
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 100000);
