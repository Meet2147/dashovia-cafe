'use strict';

// Tiny document store for users, reviews, refund requests and referral rewards.
//
// With DATABASE_URL set, documents live in Postgres in their own schema
// (DB_SCHEMA, default "cafe"), so the café can share a database with other
// apps without touching their tables. Without it (local development), they
// live in data/store.json.
//
// API: get(kind, id) · put(kind, id, data) · del(kind, id) · list(kind)
// list() returns [{ id, data, created_at }] newest first.

const fs = require('fs');
const path = require('path');

function fileStore(file) {
  let db = null;
  const load = () => {
    if (!db) { try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { db = {}; } }
    return db;
  };
  const save = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(db, null, 2));
  };
  return {
    kind: 'file',
    async init() { load(); },
    async get(kind, id) { const r = (load()[kind] || {})[id]; return r ? r.data : null; },
    async put(kind, id, data) {
      const d = load(); d[kind] = d[kind] || {};
      const prev = d[kind][id];
      d[kind][id] = { data, created_at: prev ? prev.created_at : new Date().toISOString() };
      save(); return data;
    },
    async del(kind, id) { const d = load(); if (d[kind]) { delete d[kind][id]; save(); } },
    async list(kind) {
      return Object.entries(load()[kind] || {})
        .map(([id, r]) => ({ id, data: r.data, created_at: r.created_at }))
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    },
  };
}

function pgStore(url, schema) {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('DB_SCHEMA must be a simple lowercase name');
  const { Pool } = require('pg');
  // Render's internal hostnames have no dots; anything else (external URL) needs TLS.
  const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
  const ssl = process.env.PGSSL === 'false' || !host.includes('.') || host === 'localhost' || host === '127.0.0.1'
    ? false : { rejectUnauthorized: false };
  const pool = new Pool({ connectionString: url, ssl, max: 5 });
  const T = `${schema}.docs`;
  return {
    kind: 'postgres',
    async init() {
      try { await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`); }
      catch (e) { if (e.code !== '42501') throw e; } // no CREATE permission: schema was made for us
      await pool.query(`CREATE TABLE IF NOT EXISTS ${T} (
        kind text NOT NULL, id text NOT NULL, data jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (kind, id))`);
    },
    async get(kind, id) {
      const r = await pool.query(`SELECT data FROM ${T} WHERE kind = $1 AND id = $2`, [kind, id]);
      return r.rows[0] ? r.rows[0].data : null;
    },
    async put(kind, id, data) {
      await pool.query(`INSERT INTO ${T} (kind, id, data) VALUES ($1, $2, $3)
        ON CONFLICT (kind, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [kind, id, data]);
      return data;
    },
    async del(kind, id) { await pool.query(`DELETE FROM ${T} WHERE kind = $1 AND id = $2`, [kind, id]); },
    async list(kind) {
      const r = await pool.query(`SELECT id, data, created_at FROM ${T} WHERE kind = $1 ORDER BY created_at DESC LIMIT 5000`, [kind]);
      return r.rows.map((x) => ({ id: x.id, data: x.data, created_at: new Date(x.created_at).toISOString() }));
    },
  };
}

module.exports = function createStore(root) {
  return process.env.DATABASE_URL
    ? pgStore(process.env.DATABASE_URL, process.env.DB_SCHEMA || 'cafe')
    : fileStore(path.join(root, 'data', 'store.json'));
};
