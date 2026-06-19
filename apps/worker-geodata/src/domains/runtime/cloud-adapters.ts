import type { LocalExecutionRuntime } from "../runtime/execution-runtime";
import type { SourceProcessingJob } from "../sources/source-worker";

export type CloudProvider = "aws_batch" | "gcp_batch";
export type CloudJobState =
  | "submitted"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled"
  | "unknown";

export interface CloudJobSubmission {
  provider: CloudProvider;
  externalJobId: string;
  externalJobName: string;
  raw: unknown;
}

export interface CloudJobStatus {
  provider: CloudProvider;
  externalJobId: string;
  state: CloudJobState;
  raw: unknown;
  errorMessage?: string;
}

export interface AwsBatchClient {
  submitJob(input: Record<string, unknown>): Promise<{ jobId?: string; jobName?: string }>;
  describeJobs(input: { jobs: string[] }): Promise<{ jobs?: Array<Record<string, unknown>> }>;
  terminateJob(input: { jobId: string; reason: string }): Promise<unknown>;
}

export interface GcpBatchClient {
  createJob(input: {
    parent: string;
    jobId: string;
    job: Record<string, unknown>;
  }): Promise<[Record<string, unknown>] | Record<string, unknown>>;
  getJob(input: { name: string }): Promise<[Record<string, unknown>] | Record<string, unknown>>;
  deleteJob(input: { name: string; reason?: string }): Promise<unknown>;
}

export interface CloudAdapterClients {
  awsBatch?: AwsBatchClient;
  gcpBatch?: GcpBatchClient;
}

export async function submitCloudExecutionJob(params: {
  runtime: LocalExecutionRuntime;
  sourceJob: SourceProcessingJob;
  clients: CloudAdapterClients;
}): Promise<CloudJobSubmission> {
  const target = params.runtime.executionTarget;
  if (!target || target.provider === "local") {
    throw new Error("Cloud execution requires an AWS Batch or Google Cloud Batch target");
  }
  return target.provider === "aws_batch"
    ? submitAwsBatchJob(params.runtime, params.sourceJob, params.clients.awsBatch)
    : submitGcpBatchJob(params.runtime, params.sourceJob, params.clients.gcpBatch);
}

export async function pollCloudExecutionJob(params: {
  provider: CloudProvider;
  externalJobId: string;
  clients: CloudAdapterClients;
}): Promise<CloudJobStatus> {
  return params.provider === "aws_batch"
    ? pollAwsBatchJob(params.externalJobId, params.clients.awsBatch)
    : pollGcpBatchJob(params.externalJobId, params.clients.gcpBatch);
}

export async function cancelCloudExecutionJob(params: {
  provider: CloudProvider;
  externalJobId: string;
  reason: string;
  clients: CloudAdapterClients;
}) {
  if (params.provider === "aws_batch") {
    const client = requireAwsClient(params.clients.awsBatch);
    return client.terminateJob({ jobId: params.externalJobId, reason: params.reason });
  }
  const client = requireGcpClient(params.clients.gcpBatch);
  return client.deleteJob({ name: params.externalJobId, reason: params.reason });
}

export function normalizeCloudAdapterError(error: unknown) {
  if (error instanceof Error) {
    return {
      code: "CLOUD_EXECUTION_FAILED",
      message: error.message,
    };
  }
  return {
    code: "CLOUD_EXECUTION_FAILED",
    message: String(error),
  };
}

async function submitAwsBatchJob(
  runtime: LocalExecutionRuntime,
  sourceJob: SourceProcessingJob,
  client: AwsBatchClient | undefined,
): Promise<CloudJobSubmission> {
  const target = runtime.executionTarget!;
  const config = target.config;
  const jobQueue = stringConfig(config, "jobQueue");
  const jobDefinition = stringConfig(config, "jobDefinition");
  const jobName = cloudJobName("planisfy-tiles", sourceJob.processingJobId);
  const command = runtime.workerProfile?.command.length
    ? runtime.workerProfile.command
    : undefined;
  const args = runtime.workerProfile?.args.length ? runtime.workerProfile.args : undefined;
  const response = await requireAwsClient(client).submitJob({
    jobName,
    jobQueue,
    jobDefinition,
    containerOverrides: {
      command: command && args ? [...command, ...args] : command,
      environment: Object.entries(runtime.env).map(([name, value]) => ({
        name,
        value,
      })),
      vcpus: runtime.workerProfile?.cpu ?? undefined,
      memory: runtime.workerProfile?.memoryMb ?? undefined,
    },
    parameters: {
      sourceJob: JSON.stringify(sourceJob),
    },
  });
  if (!response.jobId) throw new Error("AWS Batch did not return a jobId");
  return {
    provider: "aws_batch",
    externalJobId: response.jobId,
    externalJobName: response.jobName ?? jobName,
    raw: response,
  };
}

async function pollAwsBatchJob(
  externalJobId: string,
  client: AwsBatchClient | undefined,
): Promise<CloudJobStatus> {
  const response = await requireAwsClient(client).describeJobs({
    jobs: [externalJobId],
  });
  const job = response.jobs?.[0] ?? {};
  const status = String(job.status ?? "UNKNOWN");
  return {
    provider: "aws_batch",
    externalJobId,
    state: mapAwsStatus(status),
    raw: job,
    errorMessage: typeof job.statusReason === "string" ? job.statusReason : undefined,
  };
}

async function submitGcpBatchJob(
  runtime: LocalExecutionRuntime,
  sourceJob: SourceProcessingJob,
  client: GcpBatchClient | undefined,
): Promise<CloudJobSubmission> {
  const target = runtime.executionTarget!;
  const config = target.config;
  const projectId = stringConfig(config, "projectId");
  const location = stringConfig(config, "location");
  const parent = `projects/${projectId}/locations/${location}`;
  const jobId = cloudJobName("planisfy-tiles", sourceJob.processingJobId);
  const response = unwrapGcpResponse(
    await requireGcpClient(client).createJob({
      parent,
      jobId,
      job: {
        taskGroups: [
          {
            taskSpec: {
              runnables: [
                {
                  container: {
                    imageUri: runtime.workerProfile?.image ?? stringConfig(config, "imageUri"),
                    commands: [
                      ...(runtime.workerProfile?.command ?? []),
                      ...(runtime.workerProfile?.args ?? []),
                    ],
                  },
                },
              ],
              environment: { variables: runtime.env },
              computeResource: {
                cpuMilli: runtime.workerProfile?.cpu
                  ? runtime.workerProfile.cpu * 1000
                  : undefined,
                memoryMib: runtime.workerProfile?.memoryMb ?? undefined,
              },
              maxRunDuration: runtime.workerProfile?.timeoutSeconds
                ? `${runtime.workerProfile.timeoutSeconds}s`
                : undefined,
            },
          },
        ],
        labels: {
          source: "planisfy",
        },
        allocationPolicy: config.allocationPolicy,
        logsPolicy: config.logsPolicy,
        sourceJob,
      },
    }),
  );
  const name = typeof response.name === "string" ? response.name : `${parent}/jobs/${jobId}`;
  return {
    provider: "gcp_batch",
    externalJobId: name,
    externalJobName: jobId,
    raw: response,
  };
}

async function pollGcpBatchJob(
  externalJobId: string,
  client: GcpBatchClient | undefined,
): Promise<CloudJobStatus> {
  const response = unwrapGcpResponse(
    await requireGcpClient(client).getJob({ name: externalJobId }),
  );
  const status = asRecord(response.status);
  const state = String(status.state ?? response.status ?? "UNKNOWN");
  const statusEvents = Array.isArray(status.statusEvents)
    ? status.statusEvents
    : [];
  const firstStatusEvent = asRecord(statusEvents[0]);
  return {
    provider: "gcp_batch",
    externalJobId,
    state: mapGcpStatus(state),
    raw: response,
    errorMessage:
      typeof firstStatusEvent.description === "string"
        ? firstStatusEvent.description
        : undefined,
  };
}

function requireAwsClient(client: AwsBatchClient | undefined) {
  if (!client) throw new Error("AWS Batch client is not configured");
  return client;
}

function requireGcpClient(client: GcpBatchClient | undefined) {
  if (!client) throw new Error("Google Cloud Batch client is not configured");
  return client;
}

function stringConfig(config: Record<string, unknown>, key: string) {
  const value = config[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Cloud execution target is missing config.${key}`);
  }
  return value;
}

function cloudJobName(prefix: string, id: string | undefined) {
  return `${prefix}-${(id ?? cryptoRandomSuffix()).replace(/[^A-Za-z0-9_-]/g, "-")}`.slice(
    0,
    128,
  );
}

function cryptoRandomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}

function unwrapGcpResponse(response: [Record<string, unknown>] | Record<string, unknown>) {
  return Array.isArray(response) ? response[0] : response;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function mapAwsStatus(status: string): CloudJobState {
  switch (status) {
    case "SUBMITTED":
    case "PENDING":
    case "RUNNABLE":
    case "STARTING":
      return "submitted";
    case "RUNNING":
      return "running";
    case "SUCCEEDED":
      return "succeeded";
    case "FAILED":
      return "failed";
    default:
      return "unknown";
  }
}

function mapGcpStatus(status: string): CloudJobState {
  switch (status) {
    case "QUEUED":
    case "SCHEDULED":
      return "submitted";
    case "RUNNING":
      return "running";
    case "SUCCEEDED":
      return "succeeded";
    case "FAILED":
      return "failed";
    case "CANCELLED":
    case "DELETION_IN_PROGRESS":
      return "canceled";
    default:
      return "unknown";
  }
}
