import assert from "node:assert/strict";
import test from "node:test";
import {
  apiKeyMutationGate,
  customerComputeMutationGate,
} from "./platform-gates";

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

test("managed mode rejects customer execution target and worker profile mutations", () => {
  const denial = customerComputeMutationGate("managed");

  assert.equal(denial?.status, 403);
  assert.equal(denial?.code, "CAPABILITY_UNAVAILABLE");
});

test("self-host keeps customer execution target and worker profile mutations available", () => {
  assert.equal(customerComputeMutationGate("self_host"), null);
});
