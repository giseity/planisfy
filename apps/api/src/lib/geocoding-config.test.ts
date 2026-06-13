import assert from "node:assert/strict";
import test from "node:test";
import { isPeliasConfigured } from "./geocoding-config";

test("isPeliasConfigured accepts Pelias-compatible service roots", () => {
  assert.equal(isPeliasConfigured("http://pelias:4000"), true);
  assert.equal(isPeliasConfigured("https://geocoder.example.com/pelias"), true);
});

test("isPeliasConfigured rejects missing, invalid, and self-referential URLs", () => {
  assert.equal(isPeliasConfigured(undefined), false);
  assert.equal(isPeliasConfigured("not a url"), false);
  assert.equal(
    isPeliasConfigured("https://api.planisfy.localhost/geocoding"),
    false,
  );
  assert.equal(isPeliasConfigured("http://api:4000/geocoding/"), false);
});
