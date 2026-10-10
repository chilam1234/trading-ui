import WebSocket from 'ws';
const ws = new WebSocket('ws://127.0.0.1:9225/devtools/page/537545358D1FC0DB301C403CF26EC076', { perMessageDeflate: false });
ws.on('open', () => { ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: "(() => { const h1 = document.querySelector('.market-heading'); const cs = h1 ? getComputedStyle(h1) : null; const hud = document.querySelector('.dev-perf-hud-aside'); return JSON.stringify({h1size: cs ? cs.fontSize : 'none', h1weight: cs ? cs.fontWeight : 'none', hudZ: hud ? getComputedStyle(hud).zIndex : 'none'}); })()", returnByValue: true } })); });
ws.on('message', (d) => { const m = JSON.parse(d); console.log('CSS', m.result && m.result.result && m.result.result.value || 'ERR'); process.exit(0); });
setTimeout(() => { console.log('TO'); process.exit(1); }, 8000);
