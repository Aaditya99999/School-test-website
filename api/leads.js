/**
 * Radha Krishna Memorial Education Centre — leads CRM (Vercel Serverless Function)
 * -------------------------------------------------------------------
 * Deployed automatically at  /api/leads  by Vercel.
 *
 * Stores admission-enquiry-form submissions in Postgres and lets the
 * /crm.html dashboard read, update and delete them.
 *
 * SETUP
 *   1. Vercel dashboard -> your project -> Storage -> Create Database ->
 *      Postgres (or Neon). This sets the POSTGRES_URL environment
 *      variable for you automatically.
 *   2. Vercel dashboard -> your project -> Settings -> Environment
 *      Variables -> add:
 *          CRM_ADMIN_KEY = <a long random password>
 *      This is the password the /crm.html dashboard asks for. Anyone
 *      with it can read and delete every lead, so keep it private and
 *      only share it with staff who need it.
 *   3. Redeploy after adding them.
 *
 * The table is created automatically on first use, so no manual
 * migration step is needed.
 */

import { Pool } from 'pg';

const connectionString =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL;

let pool;
function getPool() {
  if (!connectionString) return null;
  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes('sslmode=') ? undefined : { rejectUnauthorized: false },
    });
  }
  return pool;
}

let schemaReady = false;
async function ensureSchema(client) {
  if (schemaReady) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      phone       TEXT NOT NULL,
      class       TEXT,
      message     TEXT,
      source      TEXT,
      status      TEXT NOT NULL DEFAULT 'new',
      note        TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  schemaReady = true;
}

const STATUSES = new Set(['new', 'contacted', 'enrolled', 'lost']);
const MAX_LEN = { name: 120, phone: 40, class: 120, message: 2000, source: 200, note: 2000 };

function clean(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

// Rate limit lead submissions. Serverless instances are recycled, so this
// is a speed bump against casual abuse, not a hard guarantee.
const RATE_LIMIT_HITS = 10;
const RATE_LIMIT_MS = 10 * 60 * 1000;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_LIMIT_MS);
  if (recent.length >= RATE_LIMIT_HITS) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}

function isAuthorized(req) {
  const key = process.env.CRM_ADMIN_KEY;
  if (!key) return false;
  const given = req.headers['x-admin-key'];
  return typeof given === 'string' && given === key;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const db = getPool();
  if (!db) {
    console.error('[leads] no database connection string set (POSTGRES_URL)');
    return res.status(500).json({ error: 'The leads database is not configured yet.' });
  }

  try {
    const client = await db.connect();
    try {
      await ensureSchema(client);

      if (req.method === 'POST') {
        return await createLead(req, res, client);
      }
      if (req.method === 'GET') {
        return await listLeads(req, res, client);
      }
      if (req.method === 'PATCH') {
        return await updateLead(req, res, client);
      }
      if (req.method === 'DELETE') {
        return await deleteLead(req, res, client);
      }

      res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
      return res.status(405).json({ error: 'Method not allowed.' });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[leads]', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

async function createLead(req, res, client) {
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many submissions just now. Please try again later.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Malformed request.' });
  }

  const name = clean(body.name, MAX_LEN.name);
  const phone = clean(body.phone, MAX_LEN.phone);
  const klass = clean(body.class, MAX_LEN.class);
  const message = clean(body.message, MAX_LEN.message);
  const source = clean(body.source, MAX_LEN.source);

  if (!name) return res.status(400).json({ error: 'Name is required.' });
  if (phone.replace(/\D/g, '').length < 7) {
    return res.status(400).json({ error: 'A valid phone number is required.' });
  }

  const { rows } = await client.query(
    `INSERT INTO leads (name, phone, class, message, source)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, created_at`,
    [name, phone, klass || null, message || null, source || null]
  );

  return res.status(201).json({ id: rows[0].id, created_at: rows[0].created_at });
}

async function listLeads(req, res, client) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const { rows } = await client.query(
    `SELECT id, name, phone, class, message, source, status, note, created_at
     FROM leads
     ORDER BY created_at DESC
     LIMIT 500`
  );

  return res.status(200).json({ leads: rows });
}

async function updateLead(req, res, client) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const id = Number(body?.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'A lead id is required.' });
  }

  const fields = [];
  const values = [];
  let i = 1;

  if (body.status !== undefined) {
    const status = clean(body.status, 20);
    if (!STATUSES.has(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }
    fields.push(`status = $${i++}`);
    values.push(status);
  }

  if (body.note !== undefined) {
    fields.push(`note = $${i++}`);
    values.push(clean(body.note, MAX_LEN.note) || null);
  }

  if (!fields.length) {
    return res.status(400).json({ error: 'Nothing to update.' });
  }

  values.push(id);
  const { rowCount } = await client.query(
    `UPDATE leads SET ${fields.join(', ')} WHERE id = $${i}`,
    values
  );

  if (!rowCount) return res.status(404).json({ error: 'Lead not found.' });
  return res.status(200).json({ ok: true });
}

async function deleteLead(req, res, client) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const id = Number(req.query?.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'A lead id is required.' });
  }

  const { rowCount } = await client.query('DELETE FROM leads WHERE id = $1', [id]);
  if (!rowCount) return res.status(404).json({ error: 'Lead not found.' });
  return res.status(200).json({ ok: true });
}
