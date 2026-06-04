import { describe, expect, it } from "vitest";
import {
  StyleValidationError,
  createPublishedStyleSnapshot,
  validateMapLibreStyle,
} from "../src";

const blankStyle = {
  version: 8,
  name: "Blank",
  sources: {
    custom: {
      type: "vector",
      url: "planisfy://tilesets/source",
    },
  },
  layers: [],
};

describe("@planisfy/style-spec", () => {
  it("validates MapLibre style JSON", () => {
    expect(validateMapLibreStyle(blankStyle)).toEqual([]);
    expect(validateMapLibreStyle({ layers: [] }).length).toBeGreaterThan(0);
  });

  it("creates an immutable published snapshot with source rewrites", () => {
    const snapshot = createPublishedStyleSnapshot(blankStyle, {
      sourceUrlRewrites: {
        custom: "https://example.test/tiles.json",
      },
    });

    expect(snapshot.styleJson.sources).toEqual({
      custom: {
        type: "vector",
        url: "https://example.test/tiles.json",
      },
    });
    expect(blankStyle.sources.custom.url).toBe("planisfy://tilesets/source");
  });

  it("throws for invalid style JSON", () => {
    expect(() => createPublishedStyleSnapshot({ layers: [] })).toThrow(StyleValidationError);
  });
});
