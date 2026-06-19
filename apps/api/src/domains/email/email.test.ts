import assert from "node:assert/strict";
import test from "node:test";
import {
  escapeHtml,
  htmlParagraphFromText,
  validateEmailActionUrl,
} from "./email";

test("escapeHtml escapes text and attribute-sensitive characters", () => {
  assert.equal(
    escapeHtml(`<img src=x onerror="alert('x')">`),
    "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;",
  );
});

test("htmlParagraphFromText escapes text before adding line breaks", () => {
  assert.equal(
    htmlParagraphFromText("hello\n<script>alert(1)</script>"),
    "<p>hello<br />&lt;script&gt;alert(1)&lt;/script&gt;</p>",
  );
});

test("validateEmailActionUrl rejects unsafe schemes and off-site origins", () => {
  assert.throws(
    () => validateEmailActionUrl("javascript:alert(1)"),
    /http or https/,
  );
  assert.throws(
    () => validateEmailActionUrl("https://evil.example/reset"),
    /origin is not allowed/,
  );
});
