import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("settings placeholder removal", () => {
  it("billing tab does not render static invoice IDs", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/settings/billing-tab.tsx"),
      "utf8",
    );

    expect(source).not.toContain("INV-2026");
    expect(source).toContain("No billing transactions have been recorded yet.");
  });

  it("account tab renders empty security activity without fake IPs", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/settings/account-tab.tsx"),
      "utf8",
    );

    expect(source).not.toContain("192.168.1.42");
    expect(source).not.toContain("203.0.113.42");
    expect(source).toContain("No security activity has been recorded yet.");
  });
});
