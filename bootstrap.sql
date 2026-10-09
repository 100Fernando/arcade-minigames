-- bootstrap.sql: table that stores the ranking of the page.
-- Applied automatically by `node server.js --ensure-table` (idempotent),
-- or manually with a mysql client. The database is the one in .env.
CREATE TABLE ranking (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  player_name VARCHAR(32) NOT NULL,
  game        ENUM('alvos','si') NOT NULL,
  score       INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
