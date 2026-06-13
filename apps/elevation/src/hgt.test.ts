import assert from "node:assert/strict";
import test from "node:test";
import { HgtTile, parseHgtTileName } from "./hgt";

test("parseHgtTileName parses southern and western bounds", () => {
  assert.deepEqual(parseHgtTileName("N45W123"), { south: 45, west: -123 });
  assert.deepEqual(parseHgtTileName("S01E002"), { south: -1, west: 2 });
});

test("HgtTile bilinearly samples elevations", () => {
  const data = Buffer.alloc(2 * 2 * 2);
  data.writeInt16BE(100, 0);
  data.writeInt16BE(200, 2);
  data.writeInt16BE(300, 4);
  data.writeInt16BE(400, 6);

  const tile = HgtTile.fromBuffer("N00E000", data);

  assert.equal(tile.sample({ latitude: 1, longitude: 0 })?.elevation, 100);
  assert.equal(tile.sample({ latitude: 0.5, longitude: 0.5 })?.elevation, 250);
  assert.equal(tile.sample({ latitude: 2, longitude: 0 }), null);
});
