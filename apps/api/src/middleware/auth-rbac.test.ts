import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import {
  isOrgRoleAtLeast,
  requireOrgMutationPermission,
  requireOrgMutationRole,
  resolveSessionOwnerContext,
  type AuthEnv,
} from "./auth";
import {
  canOrg,
  canPlatform,
  minOrgRoleFor,
  minPlatformRoleFor,
} from "@planisfy/utils";

test("session owner context uses personal account when no organization is active", async () => {
  const context = await resolveSessionOwnerContext(
    {
      id: "session-1",
      userId: "user-1",
      token: "token-1",
      activeOrganizationId: null,
    },
    async () => {
      throw new Error("membership lookup should not run");
    },
  );

  assert.deepEqual(context, {
    ok: true,
    ownerId: "user-1",
    orgRole: null,
  });
});

test("session owner context requires active organization membership", async () => {
  const missing = await resolveSessionOwnerContext(
    {
      id: "session-1",
      userId: "user-1",
      token: "token-1",
      activeOrganizationId: "org-1",
    },
    async () => null,
  );

  assert.equal(missing.ok, false);

  const present = await resolveSessionOwnerContext(
    {
      id: "session-1",
      userId: "user-1",
      token: "token-1",
      activeOrganizationId: "org-1",
    },
    async (userId, orgId) => {
      assert.equal(userId, "user-1");
      assert.equal(orgId, "org-1");
      return "admin";
    },
  );

  assert.deepEqual(present, {
    ok: true,
    ownerId: "org-1",
    orgRole: "admin",
  });
});

test("org role hierarchy is ordered from viewer to owner", () => {
  assert.equal(isOrgRoleAtLeast("viewer", "viewer"), true);
  assert.equal(isOrgRoleAtLeast("viewer", "member"), false);
  assert.equal(isOrgRoleAtLeast("member", "member"), true);
  assert.equal(isOrgRoleAtLeast("member", "admin"), false);
  assert.equal(isOrgRoleAtLeast("admin", "member"), true);
  assert.equal(isOrgRoleAtLeast("owner", "admin"), true);
  assert.equal(isOrgRoleAtLeast("unknown", "viewer"), false);
});

test("org permissions map product capabilities to role thresholds", () => {
  assert.equal(canOrg("viewer", "resource.read"), true);
  assert.equal(canOrg("viewer", "resource.write"), false);
  assert.equal(canOrg("member", "resource.write"), true);
  assert.equal(canOrg("member", "api_key.manage"), false);
  assert.equal(canOrg("admin", "api_key.manage"), true);
  assert.equal(canOrg("admin", "org.manage"), false);
  assert.equal(canOrg("owner", "org.manage"), true);
  assert.equal(canOrg("owner", "selfhost.upgrade"), true);
  assert.equal(canOrg("unknown", "resource.read"), false);

  assert.equal(minOrgRoleFor("billing.manage"), "admin");
  assert.equal(minOrgRoleFor("org.manage"), "owner");
  assert.equal(minOrgRoleFor("selfhost.upgrade"), "owner");
});

test("platform permissions include owner as the top platform role", () => {
  assert.equal(canPlatform("ADMIN", "platform.access"), true);
  assert.equal(canPlatform("SUPER", "platform.configuration.manage"), true);
  assert.equal(canPlatform("SUPER", "platform.ownership.manage"), false);
  assert.equal(canPlatform("OWNER", "platform.ownership.manage"), true);
  assert.equal(canPlatform("unknown", "platform.access"), false);

  assert.equal(minPlatformRoleFor("platform.configuration.manage"), "SUPER");
  assert.equal(minPlatformRoleFor("platform.ownership.manage"), "OWNER");
});

test("org mutation middleware allows personal workflows and gates org writes", async () => {
  const app = new Hono<AuthEnv>();
  app.use("*", async (c, next) => {
    const activeOrg = c.req.header("x-active-org") ?? null;
    const orgRole = c.req.header("x-org-role") ?? null;
    c.set("userId", "user-1");
    c.set("ownerId", activeOrg ?? "user-1");
    c.set("orgRole", orgRole);
    c.set("session", {
      id: "session-1",
      userId: "user-1",
      token: "token-1",
      activeOrganizationId: activeOrg,
    });
    c.set("apiKeyId", null);
    c.set("apiKeyOwnerId", null);
    c.set("apiKeyScopes", null);
    c.set("requestId", "request-1");
    await next();
  });
  app.use("/resource", requireOrgMutationRole("member"));
  app.get("/resource", (c) => c.json({ ok: true }));
  app.post("/resource", (c) => c.json({ ok: true }));

  assert.equal((await app.request("/resource")).status, 200);
  assert.equal(
    (await app.request("/resource", { method: "POST" })).status,
    200,
  );
  assert.equal(
    (
      await app.request("/resource", {
        method: "POST",
        headers: { "x-active-org": "org-1", "x-org-role": "viewer" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await app.request("/resource", {
        method: "POST",
        headers: { "x-active-org": "org-1", "x-org-role": "member" },
      })
    ).status,
    200,
  );
});

test("org mutation permission middleware allows personal workflows and gates org writes", async () => {
  const app = new Hono<AuthEnv>();
  app.use("*", async (c, next) => {
    const activeOrg = c.req.header("x-active-org") ?? null;
    const orgRole = c.req.header("x-org-role") ?? null;
    c.set("userId", "user-1");
    c.set("ownerId", activeOrg ?? "user-1");
    c.set("orgRole", orgRole);
    c.set("session", {
      id: "session-1",
      userId: "user-1",
      token: "token-1",
      activeOrganizationId: activeOrg,
    });
    c.set("apiKeyId", null);
    c.set("apiKeyOwnerId", null);
    c.set("apiKeyScopes", null);
    c.set("requestId", "request-1");
    await next();
  });
  app.use("/keys", requireOrgMutationPermission("api_key.manage"));
  app.get("/keys", (c) => c.json({ ok: true }));
  app.post("/keys", (c) => c.json({ ok: true }));

  assert.equal((await app.request("/keys")).status, 200);
  assert.equal((await app.request("/keys", { method: "POST" })).status, 200);
  assert.equal(
    (
      await app.request("/keys", {
        method: "POST",
        headers: { "x-active-org": "org-1", "x-org-role": "member" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await app.request("/keys", {
        method: "POST",
        headers: { "x-active-org": "org-1", "x-org-role": "admin" },
      })
    ).status,
    200,
  );
});
