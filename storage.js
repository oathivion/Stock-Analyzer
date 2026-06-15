import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function readJson(path) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

export function createCacheStorage({ stockPath, lookupPath, snapshotPath, authPath, databaseUrl = "" }) {
  snapshotPath ||= `${lookupPath}.snapshots.json`;
  authPath ||= `${lookupPath}.auth.json`;
  const caches = {
    stocks: readJson(stockPath),
    lookups: readJson(lookupPath),
    snapshots: readJson(snapshotPath)
  };
  const paths = { stocks: stockPath, lookups: lookupPath, snapshots: snapshotPath };
  const auth = readJson(authPath);
  auth.users ||= {};
  auth.sessions ||= {};
  let pool = null;
  let backend = "json";

  async function initialize() {
    if (!databaseUrl) return { backend, migrated: 0 };

    try {
      const { Pool } = await import("pg");
      pool = new Pool({
        connectionString: databaseUrl,
        ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false }
      });
      await pool.query(`
        CREATE TABLE IF NOT EXISTS stock_cache (
          namespace TEXT NOT NULL,
          ticker TEXT NOT NULL,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (namespace, ticker)
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_users (
          id UUID PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          watchlist JSONB NOT NULL DEFAULT '[]'::jsonb,
          portfolio JSONB NOT NULL DEFAULT '[]'::jsonb,
          alerts JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS user_sessions (
          token_hash TEXT PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          expires_at TIMESTAMPTZ NOT NULL
        )
      `);
      await pool.query("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS portfolio JSONB NOT NULL DEFAULT '[]'::jsonb");
      await pool.query("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS alerts JSONB NOT NULL DEFAULT '[]'::jsonb");

      const result = await pool.query("SELECT namespace, ticker, payload FROM stock_cache");
      const rowsByNamespace = Object.fromEntries(Object.keys(caches).map((namespace) => [namespace, []]));
      for (const row of result.rows) {
        if (rowsByNamespace[row.namespace]) rowsByNamespace[row.namespace].push(row);
      }
      for (const namespace of Object.keys(caches)) {
        if (rowsByNamespace[namespace].length) {
          caches[namespace] = Object.fromEntries(rowsByNamespace[namespace].map((row) => [row.ticker, row.payload]));
        } else {
          await replaceNamespace(namespace, caches[namespace]);
        }
      }
      if (!pool) throw new Error("PostgreSQL migration did not complete.");
      backend = "postgres";
      return { backend, migrated: result.rows.length ? 0 : Object.values(caches).reduce((sum, cache) => sum + Object.keys(cache).length, 0) };
    } catch (error) {
      pool = null;
      backend = "json";
      console.warn(`PostgreSQL unavailable; using JSON persistence: ${error.message}`);
      return { backend, error: error.message, migrated: 0 };
    }
  }

  function get(namespace) {
    return caches[namespace] || {};
  }

  async function replaceNamespace(namespace, cache) {
    if (!caches[namespace]) throw new Error(`Unknown cache namespace: ${namespace}`);
    caches[namespace] = cache;

    if (!pool) {
      await mkdir(dirname(paths[namespace]), { recursive: true });
      await writeFile(paths[namespace], `${JSON.stringify(cache, null, 2)}\n`);
      return;
    }

    let client = null;
    let databaseError = null;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      await client.query("DELETE FROM stock_cache WHERE namespace = $1", [namespace]);
      for (const [ticker, payload] of Object.entries(cache)) {
        await client.query(
          "INSERT INTO stock_cache (namespace, ticker, payload) VALUES ($1, $2, $3::jsonb)",
          [namespace, ticker, JSON.stringify(payload)]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      databaseError = error;
    } finally {
      client?.release();
    }

    if (databaseError) {
      console.warn(`PostgreSQL write failed; switching to JSON persistence: ${databaseError.message}`);
      await pool.end().catch(() => {});
      pool = null;
      backend = "json";
      await mkdir(dirname(paths[namespace]), { recursive: true });
      await writeFile(paths[namespace], `${JSON.stringify(cache, null, 2)}\n`);
    }
  }

  function status() {
    return { backend, connected: backend === "postgres" };
  }

  async function saveAuthJson() {
    await mkdir(dirname(authPath), { recursive: true });
    await writeFile(authPath, `${JSON.stringify(auth, null, 2)}\n`);
  }

  async function findUserByEmail(email) {
    if (pool) {
      const result = await pool.query("SELECT id, email, password_hash, watchlist, portfolio, alerts, created_at FROM app_users WHERE email = $1", [email]);
      const row = result.rows[0];
      return row ? { id: row.id, email: row.email, passwordHash: row.password_hash, watchlist: row.watchlist || [], portfolio: row.portfolio || [], alerts: row.alerts || [], createdAt: row.created_at } : null;
    }
    const user = Object.values(auth.users).find((item) => item.email === email) || null;
    if (user) user.alerts ||= [];
    return user;
  }

  async function findUserById(id) {
    if (pool) {
      const result = await pool.query("SELECT id, email, password_hash, watchlist, portfolio, alerts, created_at FROM app_users WHERE id = $1", [id]);
      const row = result.rows[0];
      return row ? { id: row.id, email: row.email, passwordHash: row.password_hash, watchlist: row.watchlist || [], portfolio: row.portfolio || [], alerts: row.alerts || [], createdAt: row.created_at } : null;
    }
    const user = auth.users[id] || null;
    if (user) user.alerts ||= [];
    return user;
  }

  async function createUser(user) {
    if (pool) {
      await pool.query(
        "INSERT INTO app_users (id, email, password_hash, watchlist, portfolio, alerts, created_at) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7)",
        [user.id, user.email, user.passwordHash, JSON.stringify(user.watchlist), JSON.stringify(user.portfolio || []), JSON.stringify(user.alerts || []), user.createdAt]
      );
      return user;
    }
    auth.users[user.id] = user;
    await saveAuthJson();
    return user;
  }

  async function saveSession(session) {
    if (pool) {
      await pool.query(
        "INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3) ON CONFLICT (token_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at",
        [session.tokenHash, session.userId, session.expiresAt]
      );
      return;
    }
    auth.sessions[session.tokenHash] = session;
    await saveAuthJson();
  }

  async function findSession(tokenHash) {
    if (pool) {
      const result = await pool.query("SELECT token_hash, user_id, expires_at FROM user_sessions WHERE token_hash = $1 AND expires_at > NOW()", [tokenHash]);
      const row = result.rows[0];
      return row ? { tokenHash: row.token_hash, userId: row.user_id, expiresAt: row.expires_at } : null;
    }
    const session = auth.sessions[tokenHash];
    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) return null;
    return session;
  }

  async function deleteSession(tokenHash) {
    if (pool) {
      await pool.query("DELETE FROM user_sessions WHERE token_hash = $1", [tokenHash]);
      return;
    }
    delete auth.sessions[tokenHash];
    await saveAuthJson();
  }

  async function updateWatchlist(userId, watchlist) {
    if (pool) {
      await pool.query("UPDATE app_users SET watchlist = $2::jsonb WHERE id = $1", [userId, JSON.stringify(watchlist)]);
    } else {
      auth.users[userId].watchlist = watchlist;
      await saveAuthJson();
    }
    return watchlist;
  }

  async function updatePortfolio(userId, portfolio) {
    if (pool) {
      await pool.query("UPDATE app_users SET portfolio = $2::jsonb WHERE id = $1", [userId, JSON.stringify(portfolio)]);
    } else {
      auth.users[userId].portfolio = portfolio;
      await saveAuthJson();
    }
    return portfolio;
  }

  async function updateAlerts(userId, alerts) {
    if (pool) {
      await pool.query("UPDATE app_users SET alerts = $2::jsonb WHERE id = $1", [userId, JSON.stringify(alerts)]);
    } else {
      auth.users[userId].alerts = alerts;
      await saveAuthJson();
    }
    return alerts;
  }

  return { initialize, get, replaceNamespace, status, findUserByEmail, findUserById, createUser, saveSession, findSession, deleteSession, updateWatchlist, updatePortfolio, updateAlerts };
}
