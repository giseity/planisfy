import assert from "node:assert/strict";
import test from "node:test";
import { spriteBaseUrlFromApiBase } from "./route";

test("spriteBaseUrlFromApiBase uses configured public API base", () => {
  assert.equal(
    spriteBaseUrlFromApiBase("https://api.example.com/", "acme", "basic"),
    "https://api.example.com/styles/v1/acme/basic/sprite",
  );
});

test("spriteBaseUrlFromApiBase encodes path segments", () => {
  assert.equal(
    spriteBaseUrlFromApiBase(
      "https://api.example.com",
      "acme team",
      "basic@2",
    ),
    "https://api.example.com/styles/v1/acme%20team/basic%402/sprite",
  );
});
