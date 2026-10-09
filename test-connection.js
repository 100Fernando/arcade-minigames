// teste_connection: verifies that the database described in .env is reachable.
// Run: node test-connection.js
const fs = require('fs');
const dotenv = require('dotenv');
const mysql = require('mysql2');

const cfg = dotenv.parse(fs.readFileSync(new URL('.env', `file://${process.cwd()}/`)));

const missing = ['HOST', 'USER', 'PASSWORD', 'DATABASE'].filter(k => !cfg[k]);
if (missing.length) {
  console.log('MISSING KEYS in .env: ' + missing.join(', '));
  process.exit(1);
}

console.log('target  -> ' + cfg.HOST + ':' + (cfg.PORT || 3306) + '  db=' + cfg.DATABASE);

const conn = mysql.createConnection({
  host: cfg.HOST,
  port: Number(cfg.PORT || 3306),
  user: cfg.USER,
  password: cfg.PASSWORD,
  database: cfg.DATABASE,
  connectTimeout: 12000,
});

const showErr = (label, err) => {
  console.log(label + ' FAILED -> ' + [err.code, err.errno, err.sqlMessage, err.message].filter(x => x).join(' '));
  try { conn.end(); } catch (_) {}
  process.exit(1);
};

// mysql2 callbacks are (err, values) — not (values, err).
conn.query('SELECT 1', (err, vals) => {
  if (err) { showErr('SELECT 1', err); return; }
  console.log('SELECT 1    -> OK (' + JSON.stringify(vals) + ')');
  conn.query('SHOW TABLES', (err2, rows) => {
    if (err2) { showErr('SHOW TABLES', err2); return; }
    const names = rows.map(r => Object.values(r)[0]);
    console.log('tables      -> ' + (names.length ? names.join(', ') : '(none)'));
    console.log('RESULT      -> OK, the database is usable.');
    conn.end();
  });
});

conn.on('error', (err) => {
  console.log('CONNECT FAILED -> ' + [err.code, err.errno, err.message].filter(x => x).join(' '));
  process.exit(1);
});
