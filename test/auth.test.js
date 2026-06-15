import test from "node:test";
import assert from "node:assert/strict";
import { createSession, hashPassword, hashSessionToken, parseCookies, sessionCookie, validateCredentials, verifyPassword } from "../auth.js";

test("hashes and verifies passwords without storing plaintext", async () => {
  const password = "correct-horse-42";
  const stored = await hashPassword(password);

  assert.notEqual(stored, password);
  assert.equal(await verifyPassword(password, stored), true);
  assert.equal(await verifyPassword("wrong-password", stored), false);
});

test("validates account credentials", () => {
  assert.deepEqual(validateCredentials(" USER@Example.com ", "long-enough-password"), {
    email: "user@example.com",
    password: "long-enough-password"
  });
  assert.throws(() => validateCredentials("bad-email", "long-enough-password"), /valid email/);
  assert.throws(() => validateCredentials("user@example.com", "short"), /10 characters/);
});

test("creates hashed server-side sessions and secure cookies", () => {
  const session = createSession("user-1");
  const cookie = sessionCookie(session.token, true);

  assert.equal(session.record.tokenHash, hashSessionToken(session.token));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.equal(parseCookies(cookie).stock_session, session.token);
});
