import { describe, expect, it } from "vitest";
import {
  buildLegacyFilter,
  parseLegacyFilter,
  parseLegacyFilterValue,
} from "@/features/style-editor/style-spec/filter";
import {
  commitDataFunctionStopKey,
  newDataFunctionStopKey,
} from "@/features/style-editor/style-spec/data-function";

describe("style editor typed adapters", () => {
  it.each([
    ["==", "count", 0],
    ["==", "enabled", true],
    ["==", "missing", null],
    ["==", "empty", ""],
    ["==", "code", "001"],
    ["==", "label", "one,two"],
    ["in", "kind", "road", 2, false, null, "", "001", "one,two"],
    ["all", ["has", "name"], ["!=", "status", "closed"]],
  ])("round-trips legacy filter values without coercion", (...filter) => {
    const parsed = parseLegacyFilter(filter);
    expect(parsed).not.toBeNull();
    expect(buildLegacyFilter(parsed!.combining, parsed!.conditions)).toEqual(
      filter,
    );
  });

  it("leaves expression filters in the JSON editor", () => {
    expect(parseLegacyFilter(["==", ["get", "kind"], "road"])).toBeNull();
    expect(parseLegacyFilter(["all", [">", ["zoom"], 5]])).toBeNull();
  });

  it("parses explicit JSON types while preserving plain strings", () => {
    expect(parseLegacyFilterValue("0", false)).toBe(0);
    expect(parseLegacyFilterValue("true", false)).toBe(true);
    expect(parseLegacyFilterValue("null", false)).toBeNull();
    expect(parseLegacyFilterValue("001", false)).toBe("001");
    expect(parseLegacyFilterValue("one,two", false)).toBe("one,two");
    expect(parseLegacyFilterValue('["one,two", 2, false]', true)).toEqual([
      "one,two",
      2,
      false,
    ]);
  });

  it("commits only finite numeric interval and exponential keys", () => {
    expect(commitDataFunctionStopKey("interval", "2.5")).toEqual({
      ok: true,
      value: 2.5,
    });
    expect(commitDataFunctionStopKey("exponential", "Infinity")).toEqual({
      ok: false,
    });
    expect(commitDataFunctionStopKey("interval", "")).toEqual({ ok: false });
    expect(commitDataFunctionStopKey("categorical", "001")).toEqual({
      ok: true,
      value: "001",
    });
    expect(newDataFunctionStopKey("interval")).toBe(0);
    expect(newDataFunctionStopKey("categorical")).toBe("value");
  });
});
