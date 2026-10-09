// cleanup-test-rows.js: removes the test rows from the ranking table.
// Run: node cleanup-test-rows.js
const fs = require('fs'), mysql = require('mysql2'), dotenv = require('dotenv');
const env = dotenv.parse(fs.readFileSync(new URL('.env', `file://${process.cwd()}/`)));
const c = mysql.createConnection({host: env.HOST, port: Number(env.PORT || 3306), user: env.USER, password: env.PASSWORD, database: env.DATABASE, connectTimeout: 12000});
c.query("DELETE FROM ranking WHERE player_name='__test__' OR player_name='ana'", (e, r) => {
  if (e) { console.log('DELETE FAILED -> ' + [e.code, e.errno, e.sqlMessage, e.message].filter(x => x).join(' ')); try { c.end(); } catch (_) {} process.exit(1); }
  c.query('SELECT player_name, game, score FROM ranking', (e2, r2) => {
    if (e2) { console.log('SELECT FAILED -> ' + e2.code); c.end(); process.exit(1); }
    console.log('remaining rows: ' + JSON.stringify(r2));
    c.end();
  });
});
