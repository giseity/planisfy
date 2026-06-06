import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptExecutionSecret,
  encryptExecutionSecret,
  estimateProcessingDuration,
  maskSecretValue,
  normalizeEnvName,
} from "./execution-targets";

test("execution target env values are encrypted and decryptable", () => {
  const envelope = encryptExecutionSecret("super-secret", "test-secret");

  assert.equal(envelope.alg, "AES-256-GCM");
  assert.doesNotMatch(envelope.ciphertext, /super-secret/);
  assert.equal(decryptExecutionSecret(envelope, "test-secret"), "super-secret");
});

test("execution target env metadata is normalized and masked", () => {
  assert.equal(normalizeEnvName(" aws_region "), "AWS_REGION");
  assert.equal(maskSecretValue(true), "********");
  assert.equal(maskSecretValue(false), "");
});

test("processing estimates account for zoom range, metadata, and profile", () => {
  const small = estimateProcessingDuration({
    provider: "local",
    sourceSizeBytes: 2 * 1024 * 1024,
    featureCount: 500,
    minZoom: 0,
    maxZoom: 8,
    cpu: 2,
    memoryMb: 4096,
  });
  const large = estimateProcessingDuration({
    provider: "aws_batch",
    sourceSizeBytes: 200 * 1024 * 1024,
    featureCount: 1_000_000,
    minZoom: 0,
    maxZoom: 14,
    cpu: 2,
    memoryMb: 4096,
  });

  assert.equal(small.confidence, "high");
  assert.equal(large.confidence, "high");
  assert.ok(large.maxSeconds > small.maxSeconds);
  assert.ok(small.basis.includes("worker profile"));
});
