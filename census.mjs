import WebSocket from 'ws';
const ws = new WebSocket('ws://127.0.0.1:9225/devtools/page/AAB33A1A2A9C66DBAC8D35AC0AEAD36C', { perMessageDeflate: false });
ws.on('open', () => {
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `
    (() => {
      const tags = {};
      for (const el of document.querySelectorAll('*')) tags[el.tagName] = (tags[el.tagName]||0)+1;
      const top = Object.entries(tags).sort((a,b)=>b[1]-a[1]).slice(0,12);
      return JSON.stringify(top);
    })()`, returnByValue: true }}));
});
ws.on('message', (d) => { console.log(String(JSON.parse(d).result?.result?.value)); process.exit(0); });
setTimeout(() => { console.log('TO'); process.exit(1); }, 8000);
