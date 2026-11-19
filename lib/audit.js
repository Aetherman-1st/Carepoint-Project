const pool = require('../db');

function requestIp(req) {
  if (!req) return null;
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim().slice(0, 120);
  return req.ip ? String(req.ip).slice(0, 120) : null;
}

async function logAudit({
  req = null,
  actorId = null,
  actorEmail = null,
  action,
  entityType = null,
  entityId = null,
  details = null
}) {
  if (!action) return;
  try {
    await pool.query(
      `INSERT INTO audit_logs
         (actor_id, actor_email, action, entity_type, entity_id, details, request_ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        actorId || null,
        actorEmail ? String(actorEmail).slice(0, 320) : null,
        String(action).slice(0, 120),
        entityType ? String(entityType).slice(0, 80) : null,
        Number.isInteger(entityId) ? entityId : null,
        details || null,
        requestIp(req)
      ]
    );
  } catch (err) {
    console.error('Audit log write failed:', err.message);
  }
}

module.exports = { logAudit, requestIp };
