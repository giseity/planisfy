import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { sanitizeCallbackUrl } from "@planisfy/auth/ui";
import { canParseFilter } from "@/features/style-editor/components/fields/visual-filter-builder";

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
    expect(source).toContain("Verification email requested");
    expect(source).toContain("Check your inbox!");
  });

  it("keeps platform readiness out of managed console navigation", () => {
    const source = readFileSync(
      resolve(__dirname, "../lib/console-navigation.tsx"),
      "utf8",
    );

    expect(source).toContain('href: "/platform"');
    expect(source).toContain('modes: ["self_host"]');
  });

  it("keeps platform-maintenance operation tabs self-host only", () => {
    const source = readFileSync(
      resolve(__dirname, "../features/operations/provider.tsx"),
      "utf8",
    );

    expect(source).toContain("label: 'Backups'");
    expect(source).toContain("label: 'Templates'");
    expect(source).toContain("modes: ['self_host'] as DeploymentMode[]");
  });

  it("keeps customer schedule creation to tenant-safe kinds", () => {
    const source = readFileSync(
      resolve(__dirname, "../features/operations/schedules-tab.tsx"),
      "utf8",
    );

    expect(source).toContain("'tileset_rebuild' | 'source_import'");
    expect(source).not.toContain('<SelectItem value="custom_command">');
  });

  it("does not expose stale job reconciliation from console jobs", () => {
    const source = readFileSync(
      resolve(__dirname, "../features/operations/jobs-tab.tsx"),
      "utf8",
    );

    expect(source).not.toContain("Reconcile stale jobs");
    expect(source).not.toContain("onReconcileStale");
  });

  it("gates onboarding readiness outside managed console access", () => {
    const source = readFileSync(
      resolve(__dirname, "../app/onboarding/layout.tsx"),
      "utf8",
    );

    expect(source).toContain('process.env.DEPLOYMENT_MODE === "managed"');
    expect(source).toContain("notFound()");
  });

  it("refetches sprite metadata when the sprite URL changes", () => {
    const source = readFileSync(
      resolve(
        __dirname,
        "../features/style-editor/components/fields/icon-field.tsx",
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
