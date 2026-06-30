import assert from "node:assert/strict";
import test from "node:test";
import { apiKeyMutationGate } from "./platform-gates";

test("managed unverified users cannot mutate API keys", () => {
  const denial = apiKeyMutationGate({
    deploymentMode: "managed",
    emailVerified: false,
  });

  assert.equal(denial?.status, 403);
  assert.equal(denial?.code, "EMAIL_VERIFICATION_REQUIRED");
});

test("self-host unverified users remain permissive for API keys", () => {
  assert.equal(
    apiKeyMutationGate({
      deploymentMode: "self_host",
      emailVerified: false,
    }),
    null,
  );
});
