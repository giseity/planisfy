import assert from "node:assert/strict";
import test from "node:test";
import {
  cancelCloudExecutionJob,
  normalizeCloudAdapterError,
  pollCloudExecutionJob,
  submitCloudExecutionJob,
  type AwsBatchClient,
  type GcpBatchClient,
} from "./cloud-adapters";
import type { LocalExecutionRuntime } from "./execution-runtime";
import type { SourceProcessingJob } from "../sources/source-worker";

const sourceJob: SourceProcessingJob = {
  ownerId: "account-1",
  tilesetId: "tileset-1",
  uploadKey: "uploads/input.geojson",
  processingJobId: "job-1",
  format: "geojson",
};

test("AWS Batch adapter submits, polls, and cancels jobs", async () => {
  const calls: Record<string, unknown>[] = [];
  const client: AwsBatchClient = {
    async submitJob(input) {
      calls.push(input);
      return { jobId: "aws-job-1", jobName: String(input.jobName) };
    },
    async describeJobs() {
      return { jobs: [{ jobId: "aws-job-1", status: "RUNNING" }] };
    },
    async terminateJob(input) {
      calls.push(input);
      return {};
    },
  };

  const submitted = await submitCloudExecutionJob({
    runtime: runtime("aws_batch"),
    sourceJob,
    clients: { awsBatch: client },
  });
  const status = await pollCloudExecutionJob({
    provider: "aws_batch",
    externalJobId: submitted.externalJobId,
    clients: { awsBatch: client },
  });
  await cancelCloudExecutionJob({
    provider: "aws_batch",
    externalJobId: submitted.externalJobId,
    reason: "test",
    clients: { awsBatch: client },
  });

  assert.equal(submitted.externalJobId, "aws-job-1");
  assert.equal(status.state, "running");
  assert.equal((calls[0] as { jobQueue: string }).jobQueue, "queue-a");
  assert.deepEqual((calls[1] as { jobId: string; reason: string }), {
    jobId: "aws-job-1",
    reason: "test",
  });
});

test("Google Cloud Batch adapter submits, polls, and cancels jobs", async () => {
  const calls: Record<string, unknown>[] = [];
  const client: GcpBatchClient = {
    async createJob(input) {
      calls.push(input);
      return [{ name: `${input.parent}/jobs/${input.jobId}` }];
    },
    async getJob(input) {
      calls.push(input);
      return [{ name: input.name, status: { state: "SUCCEEDED" } }];
    },
    async deleteJob(input) {
      calls.push(input);
      return {};
    },
  };

  const submitted = await submitCloudExecutionJob({
    runtime: runtime("gcp_batch"),
    sourceJob,
    clients: { gcpBatch: client },
  });
  const status = await pollCloudExecutionJob({
    provider: "gcp_batch",
    externalJobId: submitted.externalJobId,
    clients: { gcpBatch: client },
  });
  await cancelCloudExecutionJob({
    provider: "gcp_batch",
    externalJobId: submitted.externalJobId,
    reason: "test",
    clients: { gcpBatch: client },
  });

  assert.match(submitted.externalJobId, /projects\/project-a\/locations\/us-central1/);
  assert.equal(status.state, "succeeded");
  assert.equal((calls[0] as { parent: string }).parent, "projects/project-a/locations/us-central1");
  assert.deepEqual(calls[2], {
    name: submitted.externalJobId,
    reason: "test",
  });
});

test("cloud adapter errors are normalized", () => {
  assert.deepEqual(normalizeCloudAdapterError(new Error("boom")), {
    code: "CLOUD_EXECUTION_FAILED",
    message: "boom",
  });
});

function runtime(provider: "aws_batch" | "gcp_batch"): LocalExecutionRuntime {
  return {
    executionTarget: {
      id: "target-1",
      name: "Cloud target",
      provider,
      config:
        provider === "aws_batch"
          ? {
              jobQueue: "queue-a",
              jobDefinition: "tiles:1",
            }
          : {
              projectId: "project-a",
              location: "us-central1",
              imageUri: "example/tiles:latest",
            },
    },
    workerProfile: {
      id: "profile-1",
      name: "Large",
      image: "example/tiles:latest",
      command: ["node"],
      args: ["worker.js"],
      cpu: 2,
      memoryMb: 4096,
      timeoutSeconds: 600,
      concurrency: 1,
      config: {},
    },
    env: {
      PLANISFY_TOKEN: "secret",
    },
  };
}
