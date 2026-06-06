import { describe, expect, it } from "vitest";
import {
  EventPayloadValidationError,
  UnknownEventNameError,
  isKnownEventName,
  parseEventPayload,
} from "../src";

const accountId = "11111111-1111-4111-8111-111111111111";
const uploadId = "22222222-2222-4222-8222-222222222222";
const storageObjectId = "33333333-3333-4333-8333-333333333333";
const importId = "44444444-4444-4444-8444-444444444444";
const jobId = "55555555-5555-4555-8555-555555555555";
const datasetId = "66666666-6666-4666-8666-666666666666";

describe("@planisfy/events", () => {
  it("parses known event payloads", () => {
    const payload = parseEventPayload("upload.created", {
      uploadId,
      accountId,
      storageObjectId,
    });

    expect(payload.uploadId).toBe(uploadId);
  });

  it("parses source import request payloads", () => {
    const payload = parseEventPayload("source.import.requested", {
      importId,
      accountId,
      jobId,
      datasetId,
      provider: "OVERTURE",
    });

    expect(payload.provider).toBe("OVERTURE");
    expect(payload.datasetId).toBe(datasetId);
  });

  it("rejects unknown events", () => {
    expect(isKnownEventName("not.real")).toBe(false);
    expect(() => parseEventPayload("not.real", {})).toThrow(UnknownEventNameError);
  });

  it("rejects invalid payloads", () => {
    expect(() => parseEventPayload("upload.created", { uploadId })).toThrow(
      EventPayloadValidationError,
    );
  });
});
