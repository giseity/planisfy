import { describe, expect, it } from "vitest";
import {
  apiEnvelopeSchema,
  auditQuerySchema,
  updateConsoleProfileSchema,
  usageDaysQuerySchema,
} from "../src";

describe("api contracts", () => {
  it("wraps successful response payloads in a stable envelope", () => {
    const schema = apiEnvelopeSchema(updateConsoleProfileSchema);

    expect(
      schema.parse({
        data: { displayName: "Ada Lovelace", handle: "ada_lovelace" },
      }),
    ).toEqual({
      data: { displayName: "Ada Lovelace", handle: "ada_lovelace" },
    });
  });

  it("rejects invalid console profile handles", () => {
    expect(() =>
      updateConsoleProfileSchema.parse({ handle: "Bad Handle" }),
    ).toThrow();
  });

  it("coerces audit pagination query values", () => {
    expect(auditQuerySchema.parse({ page: "2", limit: "25" })).toMatchObject({
      page: 2,
      limit: 25,
    });
  });

  it("bounds usage day windows to the retention range", () => {
    expect(() => usageDaysQuerySchema.parse({ days: "365" })).toThrow();
  });
});
