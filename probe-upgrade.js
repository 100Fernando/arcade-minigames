// probe: does node's http.Server emit 'upgrade' WITHOUT any dependency?
const http = require('http');
const net = require('net');
const srv = http.createServer((req, res) => { res.end('plain'); });
srv.on('upgrade', (req, socket, head) => {
  console.log('[server] upgrade seen, headers:', JSON.stringify(req.headers).slice(0, 120));
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: x\r\n\r\n');
  socket.write('hello-from-server');
  socket.end();
});
srv.listen(8799);
const c = net.connect(8799, '127.0.0.1');
c.write('GET /x HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGcqHqk9C+rk12EwZq4KB8h4svBgqCk8xJVeVG90HWU=\r\nSec-WebSocket-Version: 13\r\n\r\n');
c.on('data', (d) => { console.log('[client] got:', d); c.end(); process.exit(0); });
setTimeout(() => { console.log('TIMEOUT - upgrade NOT emitted'); process.exit(1); }, 2000);
