const pool = require('../db');

let cachedSchema = null;

function quoteIdentifier(value) {
  return '"' + String(value).replace(/"/g, '""') + '"';
}

async function pgcryptoSchema() {
  if (cachedSchema) {
    return quoteIdentifier(cachedSchema);
  }

  const result = await pool.query(
    `SELECT n.nspname AS schema
     FROM pg_extension e
     JOIN pg_namespace n ON n.oid = e.extnamespace
     WHERE e.extname = 'pgcrypto'`
  );

  const schema = result.rows[0] && result.rows[0].schema;
  if (!schema) {
    throw new Error('pgcrypto extension is not installed on this database');
  }

  cachedSchema = schema;
  return quoteIdentifier(schema);
}

function normalizeHash(hash) {
  return String(hash || '').replace(/^\$2[by]\$/, '$2a$');
}

async function hashPassword(password, rounds = 12) {
  const schema = await pgcryptoSchema();
  const cost = Math.max(4, Math.min(31, Number(rounds) || 12));
  const result = await pool.query(
    `SELECT ${schema}.crypt($1, ${schema}.gen_salt('bf', $2::int)) AS hash`,
    [String(password), cost]
  );
  return result.rows[0].hash;
}

async function verifyPassword(password, hash) {
  const normalized = normalizeHash(hash);
  if (!normalized) return false;

  const schema = await pgcryptoSchema();
  const result = await pool.query(
    `SELECT ${schema}.crypt($1, $2) = $2 AS matches`,
    [String(password), normalized]
  );
  return Boolean(result.rows[0] && result.rows[0].matches);
}

module.exports = {
  hashPassword,
  verifyPassword,
  normalizeHash
};
