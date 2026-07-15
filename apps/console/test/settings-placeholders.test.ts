import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("settings placeholder removal", () => {
  it("billing tab does not render static invoice IDs", () => {
    const source = readFileSync(
      resolve(__dirname, "../features/settings/billing-tab.tsx"),
      "utf8",
    );

    expect(source).not.toContain("INV-2026");
    expect(source).toContain("No billing transactions have been recorded yet.");
  });

  it("account tab renders empty security activity without fake IPs", () => {
    const source = readFileSync(
      resolve(__dirname, "../features/settings/account-tab.tsx"),
      "utf8",
    );

    expect(source).not.toContain("192.168.1.42");
    expect(source).not.toContain("203.0.113.42");
    expect(source).toContain("No security activity has been recorded yet.");
  });

  it("operations tabs do not render adapter placeholder copy", () => {
    const templatesSource = readFileSync(
      resolve(__dirname, "../features/operations/templates-tab.tsx"),
      "utf8",
    );
    const notificationsSource = readFileSync(
      resolve(__dirname, "../features/operations/notifications-tab.tsx"),
      "utf8",
    );

    expect(templatesSource).not.toContain("not automated yet");
    expect(notificationsSource).not.toContain("stored until");
    expect(templatesSource).toContain("api.applyWorkflowTemplate");
    expect(notificationsSource).toContain("api.testNotificationChannel");
  });

  it("Overture import dialog does not initialize demo region values", () => {
    const source = readFileSync(
      resolve(__dirname, "../features/tilesets/components/overture-import-dialog.tsx"),
      "utf8",
    );

    expect(source).not.toContain('useState("Demo region")');
    expect(source).not.toContain('useState("demo-region")');
    expect(source).toContain("Use sample bbox");
  });

  it("style editor only loads sample style for the new draft route", () => {
    const source = readFileSync(
      resolve(__dirname, "../app/(studio)/styles/[styleId]/client-page.tsx"),
      "utf8",
    );

    expect(source).toContain("if (id === 'new')");
    expect(source).toContain("loadStyle(sampleStyle)");
    expect(source).toContain("Style not found.");
  });

  it("docs no longer claim sprites or tilequery are unavailable", () => {
    const migration = readFileSync(
      resolve(__dirname, "../../docs/content/docs/migration.mdx"),
      "utf8",
    );
    const sprites = readFileSync(
      resolve(__dirname, "../../docs/content/docs/api/sprites.mdx"),
      "utf8",
    );

    expect(migration).not.toContain("Tilequery is not implemented");
    expect(sprites).not.toContain("Sprite publication is not implemented");
  });
});
