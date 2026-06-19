import assert from "node:assert/strict";
import test from "node:test";
import {
  SourceUrlRejectedError,
  validateOutboundUrl,
  validateRemoteSourceUrl,
} from "./source-url-policy";

test("validateRemoteSourceUrl accepts public http and https URLs", () => {
  assert.equal(
    validateRemoteSourceUrl("https://example.com/data.parquet"),
    "https://example.com/data.parquet",
  );
  assert.equal(
    validateRemoteSourceUrl("http://public.example.com/source.geojson"),
    "http://public.example.com/source.geojson",
  );
});

test("validateRemoteSourceUrl rejects local and private targets by default", () => {
  for (const url of [
    "http://localhost:4000/data",
    "http://localhost./data",
    "http://127.0.0.1/data",
    "http://2130706433/data",
    "http://0177.0.0.1/data",
    "http://0x7f.0.0.1/data",
    "http://127.1/data",
    "http://10.0.0.2/data",
    "http://172.20.0.2/data",
    "http://192.168.1.1/data",
    "http://[::1]/data",
    "http://[::ffff:127.0.0.1]/data",
    "http://[2001:db8::1]/data",
    "http://169.254.169.254/latest/meta-data",
    "http://metadata.google.internal/computeMetadata/v1",
    "ftp://example.com/file",
    "https://user:pass@example.com/file",
  ]) {
    assert.throws(
      () => validateRemoteSourceUrl(url),
      SourceUrlRejectedError,
      url,
    );
  }
});

test("validateRemoteSourceUrl can allow private hosts for explicit deployments", () => {
  assert.equal(
    validateRemoteSourceUrl("http://10.0.0.2/data", {
      allowPrivateUrls: true,
    }),
    "http://10.0.0.2/data",
  );
});

test("validateOutboundUrl rejects private hosts and enforces exact allowlists", () => {
  assert.equal(
    validateOutboundUrl("https://hooks.slack.com/services/T/B/C", {
      allowedHosts: ["hooks.slack.com"],
    }),
    "https://hooks.slack.com/services/T/B/C",
  );

  for (const url of [
    "http://169.254.169.254/latest/meta-data",
    "https://evil.hooks.slack.com/services/T/B/C",
    "https://hooks.slack.com.evil.example/services/T/B/C",
    "https://user:pass@hooks.slack.com/services/T/B/C",
  ]) {
    assert.throws(
      () =>
        validateOutboundUrl(url, {
          allowedHosts: ["hooks.slack.com"],
        }),
      SourceUrlRejectedError,
      url,
    );
  }
});
