import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:9224/devtools/browser/0492f1c8-595a-4399-a4c0-3f4ff4c73085', { perMessageDeflate: false });
let nid = 10;
ws.on('open', () => {
  ws.send(JSON.stringify({ id: 1, method: 'Target.getTargets' }));
});
const targets = {};
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id === 1) {
    const info = (m.result.targetInfos||[]).find(t => t.url.includes('5173') && t.type === 'page');
    if (!info) { console.log('NO_TARGET'); process.exit(1); }
    ws.send(JSON.stringify({ id: 2, method: 'Target.attachToTarget', params: { targetId: info.targetId, flatten: true } }));
  }
  if (m.id === 2) {
    ws.send(JSON.stringify({ id: 3, method: 'Runtime.evaluate', params: { expression: '"attached"', returnByValue: true }, sessionId: m.result.sessionId }));
  }
  if (m.result && m.result.value) { console.log('ATTACHED_EVAL', m.result.value); process.exit(0); }
});
setTimeout(() => { console.log('BROWSER_ATTACH_TIMEOUT'); process.exit(1); }, 10000);
