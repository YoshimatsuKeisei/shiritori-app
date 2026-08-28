import assert from "node:assert/strict";
import test from "node:test";

import { resolveBrowserDictionaryBaseUrl } from "./config.js";

test("resolves an external dictionary URL and removes trailing slashes", () => {
  assert.equal(resolveBrowserDictionaryBaseUrl(" https://example.test/shiritori-dictionary-v1/ "), "https://example.test/shiritori-dictionary-v1");
  assert.equal(resolveBrowserDictionaryBaseUrl("https://example.test/shiritori-dictionary-v1"), "https://example.test/shiritori-dictionary-v1");
});

test("falls back to the local dictionary for missing or empty configuration", () => {
  assert.equal(resolveBrowserDictionaryBaseUrl(undefined), "/dictionary");
  assert.equal(resolveBrowserDictionaryBaseUrl("   "), "/dictionary");
});
