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

describe("@planisfy/events", () => {
  it("parses known event payloads", () => {
    const payload = parseEventPayload("upload.created", {
      uploadId,
      accountId,
      storageObjectId,
    });

    expect(payload.uploadId).toBe(uploadId);
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
