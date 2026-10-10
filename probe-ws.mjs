import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:9223/devtools/page/ACC9651A1196C172B0084C243188EA90', { perMessageDeflate: false });
console.log('connecting');
ws.on('open', () => console.log('OPEN'));
ws.on('error', (e) => console.log('ERR', e.message));
ws.on('close', () => console.log('CLOSED'));
setTimeout(() => { console.log('tick'); process.exit(0); }, 5000);
