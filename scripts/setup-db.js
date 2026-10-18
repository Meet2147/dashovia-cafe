'use strict';
// One-time setup: give the café its own login and schema inside an existing
// Postgres database (e.g. CodeStreak's), with no access to anything else.
//
//   node scripts/setup-db.js "<owner DATABASE_URL>"
//
// Prints the café's own DATABASE_URL to put in the café's Render environment.
const crypto = require('crypto');
const { Client } = require('pg');

(async () => {
  const ownerUrl = process.argv[2];
  if (!ownerUrl) { console.error('Usage: node scripts/setup-db.js "<owner DATABASE_URL>"'); process.exit(1); }
  const u = new URL(ownerUrl);
  const ssl = u.hostname.includes('.') && !['localhost', '127.0.0.1'].includes(u.hostname) ? { rejectUnauthorized: false } : false;
  const db = new Client({ connectionString: ownerUrl, ssl });
  await db.connect();

  const role = 'cafe_app';
  const schema = 'cafe';
  const password = crypto.randomBytes(24).toString('base64url');
  const exists = (await db.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])).rowCount > 0;
  await db.query(`${exists ? 'ALTER' : 'CREATE'} ROLE ${role} WITH LOGIN PASSWORD '${password}'`);
  await db.query(`GRANT ${role} TO CURRENT_USER`); // lets the owner create the schema for it (needed on PG16+)
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${schema} AUTHORIZATION ${role}`);
  await db.query(`ALTER SCHEMA ${schema} OWNER TO ${role}`); // in case it already existed
  await db.query(`ALTER TABLE IF EXISTS ${schema}.docs OWNER TO ${role}`);
  await db.query(`REVOKE ALL ON SCHEMA public FROM ${role}`);
  await db.query(`ALTER ROLE ${role} SET search_path = ${schema}`);
  await db.end();

  u.username = role;
  u.password = password;
  console.log('\nCafé DATABASE_URL (keep it secret):\n' + u.toString() + '\n');
})().catch((e) => { console.error('Setup failed:', e.message); process.exit(1); });
