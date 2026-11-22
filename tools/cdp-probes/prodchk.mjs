import WebSocket from 'ws';
const ws = new WebSocket('ws://127.0.0.1:9225/devtools/page/2B932D8CFD4B70C3A4B3CBD34351955C', { perMessageDeflate: false });
ws.on('open', () => {
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `
    JSON.stringify({
      heap: (performance.memory.usedJSHeapSize/1048576).toFixed(1),
      origin: location.origin,
      live: document.body.innerText.indexOf('LIVE') >= 0,
      txt: document.body.innerText.slice(0, 400),
    })`, returnByValue: true }}));
});
ws.on('message', (d) => { console.log(String(d).slice(0, 700)); process.exit(0); });
setTimeout(() => { console.log('TO'); process.exit(1); }, 8000);
