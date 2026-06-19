import assert from "node:assert/strict";
import test from "node:test";
import {
  canReadPublishedStyle,
  parseStyleHandleVersion,
  publishedStyleJson,
  styleCacheControl,
  styleEtag,
} from "./public-style-contract";

test("parseStyleHandleVersion accepts latest and explicit immutable versions", () => {
  assert.deepEqual(parseStyleHandleVersion("streets"), {
    handle: "streets",
    version: undefined,
    invalidVersion: false,
  });
  assert.deepEqual(parseStyleHandleVersion("streets@12"), {
    handle: "streets",
    version: 12,
    invalidVersion: false,
  });
});

test("parseStyleHandleVersion rejects invalid version aliases", () => {
  assert.deepEqual(parseStyleHandleVersion("streets@0"), {
    handle: "streets",
    version: undefined,
    invalidVersion: true,
  });
  assert.deepEqual(parseStyleHandleVersion("streets@latest"), {
    handle: "streets",
    version: undefined,
    invalidVersion: true,
  });
});

test("published style access allows public readers and private owners only", () => {
  assert.equal(
    canReadPublishedStyle({ isPublic: true, styleOwnerId: "owner-a" }),
    true,
  );
  assert.equal(
    canReadPublishedStyle({
      isPublic: false,
      styleOwnerId: "owner-a",
      requestOwnerId: "owner-a",
    }),
    true,
  );
  assert.equal(
    canReadPublishedStyle({
      isPublic: false,
      styleOwnerId: "owner-a",
      requestOwnerId: "owner-b",
    }),
    false,
  );
});

test("style cache headers encode public and immutable snapshot identity", () => {
  assert.equal(styleCacheControl(true), "public, max-age=300");
  assert.equal(styleCacheControl(false), "private, no-cache");
  assert.equal(styleEtag("style-1", 3), '"style-style-1-v3"');
});

test("published style JSON resolves from immutable snapshot, not mutable draft", () => {
  const draftStyleJson = {
    version: 8,
    name: "Draft edit",
    sources: { draft: { type: "vector", url: "draft://tiles" } },
    layers: [],
  };
  const snapshotStyleJson = {
    version: 8,
    name: "Published snapshot",
    sources: { published: { type: "vector", url: "published://tiles" } },
    layers: [],
  };

  assert.deepEqual(
    publishedStyleJson({ draftStyleJson, snapshotStyleJson }),
    snapshotStyleJson,
  );
});

test("published style JSON includes sprite URL only when configured", () => {
  const snapshotStyleJson = {
    version: 8,
    name: "Published snapshot",
    sources: {},
    layers: [],
  };

  assert.deepEqual(
    publishedStyleJson({
      draftStyleJson: {},
      snapshotStyleJson,
      spriteBaseUrl: null,
    }),
    snapshotStyleJson,
  );
  assert.deepEqual(
    publishedStyleJson({
      draftStyleJson: {},
      snapshotStyleJson,
      spriteBaseUrl: "https://api.example.com/styles/v1/acme/basic/sprite",
    }),
    {
      ...snapshotStyleJson,
      sprite: "https://api.example.com/styles/v1/acme/basic/sprite",
    },
  );
});
