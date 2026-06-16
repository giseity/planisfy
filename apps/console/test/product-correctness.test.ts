import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { sanitizeCallbackUrl } from "@planisfy/auth/ui";
import { canParseFilter } from "@/components/style-editor/fields/visual-filter-builder";

describe("console product correctness regressions", () => {
  it("uses Better Auth member IDs when removing team members", () => {
    const source = readFileSync(
      resolve(__dirname, "../app/(studio)/team/page.tsx"),
      "utf8",
    );

    expect(source).toContain("setRemoveId(member.id)");
    expect(source).not.toContain("setRemoveId(member.userId)");
  });

  it("handles verification resend API errors", () => {
    const source = readFileSync(
      resolve(
        __dirname,
        "../components/shell/email-verification-banner.tsx",
      ),
      "utf8",
    );

    expect(source).toContain("result.error");
    expect(source).toContain("Verification email sent");
  });

  it("refetches sprite metadata when the sprite URL changes", () => {
    const source = readFileSync(
      resolve(
        __dirname,
        "../components/style-editor/fields/icon-field.tsx",
      ),
      "utf8",
    );

    expect(source).toContain("spriteMetadata && spriteMetadata.url === spriteUrl");
    expect(source).toContain("setSpriteMetadata({ url: spriteUrl");
    expect(source).toContain("}, [spriteUrl]);");
    expect(source).not.toContain("if (!spriteUrl || sprites) return;");
  });

  it("does not visually parse expression-style filters", () => {
    expect(canParseFilter(["==", "class", "park"])).toBe(true);
    expect(canParseFilter(["==", ["get", "class"], "park"])).toBe(false);
    expect(canParseFilter(["in", "class", ["literal", ["park"]]])).toBe(
      false,
    );
  });

  it("allows explicit console-origin auth callbacks from a separate auth origin", () => {
    expect(
      sanitizeCallbackUrl(
        "https://console.planisfy.localhost/styles",
        "https://console.planisfy.localhost",
        "https://auth.planisfy.localhost",
      ),
    ).toBe("https://console.planisfy.localhost/styles");
    expect(
      sanitizeCallbackUrl(
        "https://evil.example/styles",
        "https://console.planisfy.localhost",
        "https://auth.planisfy.localhost",
      ),
    ).toBe("https://console.planisfy.localhost");
  });
});
