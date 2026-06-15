import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCacheStorage } from "../storage.js";

test("uses JSON persistence when DATABASE_URL is absent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stock-analyzer-"));
  const stockPath = join(directory, "stocks.json");
  const lookupPath = join(directory, "lookups.json");
  const authPath = join(directory, "auth.json");

  try {
    const storage = createCacheStorage({ stockPath, lookupPath, authPath });
    const startup = await storage.initialize();
    await storage.replaceNamespace("lookups", { IBM: { ticker: "IBM", price: 250 } });
    await storage.replaceNamespace("snapshots", { sample: { ticker: "IBM", score: 70 } });

    assert.equal(startup.backend, "json");
    assert.equal(storage.status().connected, false);
    assert.equal(storage.get("lookups").IBM.price, 250);
    assert.equal(storage.get("snapshots").sample.score, 70);
    assert.equal(JSON.parse(await readFile(lookupPath, "utf8")).IBM.ticker, "IBM");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("persists local users, sessions, and watchlists", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stock-accounts-"));
  const storage = createCacheStorage({
    stockPath: join(directory, "stocks.json"),
    lookupPath: join(directory, "lookups.json"),
    authPath: join(directory, "auth.json")
  });
  const user = { id: "user-1", email: "user@example.com", passwordHash: "hash", watchlist: ["NVDA"], portfolio: [], alerts: [], createdAt: new Date().toISOString() };

  try {
    await storage.initialize();
    await storage.createUser(user);
    await storage.saveSession({ tokenHash: "token", userId: user.id, expiresAt: new Date(Date.now() + 60_000).toISOString() });
    await storage.updateWatchlist(user.id, ["NVDA", "MSFT"]);
    await storage.updatePortfolio(user.id, [{ ticker: "NVDA", shares: 2, averageCost: 100 }]);
    await storage.updateAlerts(user.id, [{ id: "alert-1", ticker: "NVDA", metric: "price", operator: "above", threshold: 200 }]);

    assert.equal((await storage.findUserByEmail(user.email)).id, user.id);
    assert.deepEqual((await storage.findUserById(user.id)).watchlist, ["NVDA", "MSFT"]);
    assert.deepEqual((await storage.findUserById(user.id)).portfolio, [{ ticker: "NVDA", shares: 2, averageCost: 100 }]);
    assert.equal((await storage.findUserById(user.id)).alerts[0].id, "alert-1");
    assert.equal((await storage.findSession("token")).userId, user.id);
    await storage.deleteSession("token");
    assert.equal(await storage.findSession("token"), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
