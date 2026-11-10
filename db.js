require('dotenv').config();
const { Pool } = require('pg');

const RETRYABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '57P01',
  '57P02',
  '57P03'
]);

const MAX_RETRIES = Number(process.env.DB_MAX_RETRIES) || 3;
const RETRY_DELAY_MS = Number(process.env.DB_RETRY_DELAY_MS) || 250;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: Number(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS) || 30000,
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS) || 5000,
  keepAlive: true
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

function isRetryable(err) {
  if (!err) return false;
  if (RETRYABLE_CODES.has(err.code)) return true;
  return /ECONNREFUSED|ECONNRESET|ETIMEDOUT|Connection terminated|Connection closed/i.test(
    err.message || ''
  );
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const originalQuery = pool.query.bind(pool);

pool.query = async function queryWithRetry(...args) {
  if (typeof args[args.length - 1] === 'function') {
    return originalQuery(...args);
  }

  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await originalQuery(...args);
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt === MAX_RETRIES) {
        throw err;
      }
      console.warn(
        `PostgreSQL query failed (${err.code || err.message}); retrying ${attempt + 1}/${MAX_RETRIES}`
      );
      await delay(RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw lastError;
};

module.exports = pool;
