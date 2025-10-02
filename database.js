const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, process.env.DB_PATH || './database.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Users table: id (discord user id), balance (heavenly pounds), gold, wood, food, stone
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    balance REAL DEFAULT 0,
    gold INTEGER DEFAULT 0,
    wood INTEGER DEFAULT 0,
    food INTEGER DEFAULT 0,
    stone INTEGER DEFAULT 0,
    last_daily DATE,
    daily_streak INTEGER DEFAULT 0
  )`);

  // Message count for rewards
  db.run(`CREATE TABLE IF NOT EXISTS message_counts (
    user_id TEXT,
    count INTEGER DEFAULT 0,
    last_reset DATE DEFAULT CURRENT_DATE,
    PRIMARY KEY (user_id, last_reset)
  )`);

  // Voice time in minutes
  db.run(`CREATE TABLE IF NOT EXISTS voice_times (
    user_id TEXT,
    minutes INTEGER DEFAULT 0,
    last_reset DATE DEFAULT CURRENT_DATE,
    PRIMARY KEY (user_id, last_reset)
  )`);

  // Invites
  db.run(`CREATE TABLE IF NOT EXISTS invites (
    user_id TEXT,
    invites INTEGER DEFAULT 0,
    PRIMARY KEY (user_id)
  )`);

  // Boosts
  db.run(`CREATE TABLE IF NOT EXISTS boosts (
    user_id TEXT,
    boosts INTEGER DEFAULT 0,
    PRIMARY KEY (user_id)
  )`);

  // Server-wide stats
  db.run(`CREATE TABLE IF NOT EXISTS server_stats (
    id TEXT PRIMARY KEY,
    rewarded_boosts INTEGER DEFAULT 0,
    pool_balance REAL DEFAULT 0
  )`);
});

module.exports = db;