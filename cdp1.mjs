import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:9223/devtools/page/629FE07B0AD64F3A005ACA1F51B489C1', { perMessageDeflate: false });
ws.on('open', () => { console.log('OPEN_OK'); process.exit(0); });
ws.on('error', (e) => { console.log('ERR', e.message); process.exit(1); });
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 8000);
