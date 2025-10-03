const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        balance REAL DEFAULT 0,
        gold BIGINT DEFAULT 0,
        wood BIGINT DEFAULT 0,
        food BIGINT DEFAULT 0,
        stone BIGINT DEFAULT 0,
        last_daily DATE,
        daily_streak INTEGER DEFAULT 0
      )
    `);

    // Message count for rewards
    await client.query(`
      CREATE TABLE IF NOT EXISTS message_counts (
        user_id TEXT,
        count INTEGER DEFAULT 0,
        last_reset DATE DEFAULT CURRENT_DATE,
        PRIMARY KEY (user_id, last_reset)
      )
    `);

    // Voice time in minutes
    await client.query(`
      CREATE TABLE IF NOT EXISTS voice_times (
        user_id TEXT,
        minutes INTEGER DEFAULT 0,
        last_reset DATE DEFAULT CURRENT_DATE,
        PRIMARY KEY (user_id, last_reset)
      )
    `);

    // Invites
    await client.query(`
      CREATE TABLE IF NOT EXISTS invites (
        user_id TEXT PRIMARY KEY,
        invites INTEGER DEFAULT 0
      )
    `);

    // Boosts
    await client.query(`
      CREATE TABLE IF NOT EXISTS boosts (
        user_id TEXT PRIMARY KEY,
        boosts INTEGER DEFAULT 0
      )
    `);

    // Server-wide stats
    await client.query(`
      CREATE TABLE IF NOT EXISTS server_stats (
        id TEXT PRIMARY KEY,
        rewarded_boosts INTEGER DEFAULT 0,
        pool_balance REAL DEFAULT 0
      )
    `);

    console.log('Database tables checked/created successfully.');
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    client.release();
  }
}

initializeDatabase();

module.exports = pool;