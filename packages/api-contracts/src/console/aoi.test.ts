import { describe, expect, it } from "vitest";
import {
  areaOfInterestToBBox,
  areaOfInterestToHgtTileNames,
  bboxToHgtTileNames,
  normalizeAreaOfInterest,
} from "./aoi";

describe("area of interest helpers", () => {
  it("normalizes full-world areas", () => {
    expect(areaOfInterestToBBox({ kind: "world" })).toEqual([
      -180, -90, 180, 90,
    ]);
  });

  it("keeps tiny bbox spans addressable", () => {
    expect(bboxToHgtTileNames([7.1, 9.1, 7.2, 9.2])).toEqual(["N09E007"]);
  });

  it("treats exact max edges as exclusive for HGT lower-left names", () => {
    expect(bboxToHgtTileNames([179, 89, 180, 90])).toEqual(["N89E179"]);
    expect(areaOfInterestToHgtTileNames({ kind: "world" })).toHaveLength(
      64_800,
    );
  });

  it("rejects invalid bounds", () => {
    expect(() =>
      normalizeAreaOfInterest({ kind: "bbox", bbox: [10, 20, 1, 30] }),
    ).toThrow(/WGS84/);
  });
});
