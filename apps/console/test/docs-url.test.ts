import { describe, expect, it } from "vitest";
import { docsUrl } from "@/lib/docs-url";

describe("docsUrl", () => {
  it("joins configured docs origin and docs paths", () => {
    expect(docsUrl("/docs/self-hosting/external-compute")).toBe(
      "https://docs.planisfy.localhost/docs/self-hosting/external-compute",
    );
    expect(docsUrl("docs/self-hosting/data-sources")).toBe(
      "https://docs.planisfy.localhost/docs/self-hosting/data-sources",
    );
  });
});
