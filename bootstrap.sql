-- bootstrap.sql: tables for the ranking (google identity + scores).
-- Applied by `node server.js --ensure-table` (idempotent). DB from .env.
-- NOTE: the live DB already has a password-based `users` table (possibly shared
-- with another app). We do NOT touch it. Google identity lives in `google_users`.

CREATE TABLE google_users (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  google_sub  VARCHAR(255) NOT NULL UNIQUE,
  name        VARCHAR(32)  NOT NULL,
  email       VARCHAR(128),
  picture     VARCHAR(512),
  hd          VARCHAR(64),
  locale      VARCHAR(16),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login  TIMESTAMP
);

CREATE TABLE ranking (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NULL,
  player_name VARCHAR(32) NOT NULL,
  game        ENUM('alvos','si','arkanoid') NOT NULL,
  score       INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
