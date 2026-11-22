import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:9225/devtools/browser/b0201957-4ac7-4f7e-946f-759b840af6b7', { perMessageDeflate: false });
ws.on('open', () => {
  ws.send(JSON.stringify({ id: 1, method: 'Target.createTarget', params: { url: 'http://localhost:5173' } }));
});
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id === 1) { console.log('NEW_TARGET ' + m.result.targetId); process.exit(0); }
});
setTimeout(() => process.exit(1), 8000);
