import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import type { StorageProvider } from "@planisfy/storage";
import { createPublishedStorageResponse } from "./stream-response";

test("published local artifacts stream without calling the buffering API", async () => {
  let bodyStarted = false;
  const storage = {
    async download() {
      throw new Error("buffering download must not be called");
    },
    async downloadStream() {
      return Readable.from(
        (async function* () {
          bodyStarted = true;
          yield Buffer.from("published archive");
        })(),
      );
    },
  } as unknown as StorageProvider;

  const response = await createPublishedStorageResponse({
    storage,
    key: "published.pmtiles",
    contentType: "application/vnd.pmtiles",
    size: 17,
  });

  assert.equal(bodyStarted, false);
  assert.equal(response.headers.get("content-length"), "17");
  assert.equal(await response.text(), "published archive");
  assert.equal(bodyStarted, true);
});
