// probe-net-leg.js — measure the pure network leg: TLS handshake + TTFB from
// this machine (Brazil) to the VPS, plus a few repeats to see the distribution.
'use strict';
const https = require('https');
const HOST = 'ferramox.duckdns.org';
async function one() {
  const t0 = Date.now();
  const rq = https.request({ host: HOST, path: '/ranking-api/api/health', agent: false });
  const p = new Promise((ok) => {
    rq.on('response', (r) => {
      let n = 0, ttfb = null;
      r.on('data', (d) => { if (ttfb === null) ttfb = Date.now() - t0; n += d.length; });
      r.on('end', () => ok({ ttfb, total: Date.now() - t0, status: r.statusCode, n }));
    });
  });
  rq.on('error', (e) => ok({ err: e.code }));
  rq.end();
  return p;
}
(async () => {
  const a = await one(); // cold: fresh TCP + TLS every time (agent:false)
  const warm = [];
  for (let i = 0; i < 6; i++) warm.push((await one()).ttfb);
  console.log('cold  :', JSON.stringify(a));
  console.log('warm ttfb ms:', warm.join(','));
})();
