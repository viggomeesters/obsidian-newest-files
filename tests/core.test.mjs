import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_INDEX_ENTRIES,
  buildDisplayFilesFromIndex,
  buildDisplayFiles,
  formatFileSize,
  getExtension,
  isExcludedPath,
  makeIndexedFile,
  normalizeSettings,
  shouldDisplayFile,
  trimIndex,
  updateIndexedMetadata,
} from "../dist/core.mjs";

const settings = normalizeSettings({
  maxItems: 10,
  excludedPaths: ".obsidian/\narchive/private",
  extensionFilter: "",
  sortMode: "first-seen",
  backfillTimestamp: "created",
});

function file(path, ctime, mtime, size = 100) {
  const name = path.split("/").pop();
  const extension = getExtension(path);
  return { path, name, extension, stat: { ctime, mtime, size } };
}

test("normalizes bounded settings", () => {
  const normalized = normalizeSettings({ maxItems: 9999, sortMode: "other", backfillTimestamp: "other" });
  assert.equal(normalized.maxItems, 500);
  assert.equal(normalized.sortMode, "first-seen");
  assert.equal(normalized.backfillTimestamp, "created");
  assert.equal(normalized.showTimestamps, true);
  assert.equal(normalizeSettings({ showTimestamps: false }).showTimestamps, false);
});

test("excludes exact paths and folder prefixes", () => {
  assert.equal(isExcludedPath(".obsidian/plugins/x/main.js", settings.excludedPaths), true);
  assert.equal(isExcludedPath("archive/private", settings.excludedPaths), true);
  assert.equal(isExcludedPath("archive/private/file.md", settings.excludedPaths), true);
  assert.equal(isExcludedPath("archive/public/file.md", settings.excludedPaths), false);
});

test("default settings exclude runtime folders and generated sqlite sidecars", () => {
  const defaults = normalizeSettings({});
  assert.equal(shouldDisplayFile(file("system/memory/raw.jsonl", 1, 1), defaults), false);
  assert.equal(shouldDisplayFile(file(".tmp/cache.txt", 1, 1), defaults), false);
  assert.equal(shouldDisplayFile(file("system/index.sqlite-wal", 1, 1), defaults), false);
  assert.equal(shouldDisplayFile(file("20_files/report.pdf", 1, 1), defaults), true);
});

test("filters by extension when configured", () => {
  const filtered = normalizeSettings({ extensionFilter: "md, pdf png" });
  assert.equal(shouldDisplayFile(file("a.md", 1, 1), filtered), true);
  assert.equal(shouldDisplayFile(file("image.PNG", 1, 1), filtered), true);
  assert.equal(shouldDisplayFile(file("sheet.xlsx", 1, 1), filtered), false);
});

test("creates event and backfill index entries with different first-seen semantics", () => {
  const newFile = file("20_files/2026-06/new.pdf", 100, 200);
  const backfilled = makeIndexedFile(newFile, "backfill", settings, 999);
  const event = makeIndexedFile(newFile, "event", settings, 999);
  assert.equal(backfilled.firstSeen, 100);
  assert.equal(backfilled.firstSeenSource, "backfill");
  assert.equal(event.firstSeen, 999);
  assert.equal(event.firstSeenSource, "event");
});

test("metadata updates keep first-seen value intact", () => {
  const original = makeIndexedFile(file("a.md", 100, 200), "event", settings, 999);
  const updated = updateIndexedMetadata(original, file("a.md", 100, 500, 42));
  assert.equal(updated.firstSeen, 999);
  assert.equal(updated.mtime, 500);
  assert.equal(updated.size, 42);
});

test("display files are sorted newest-first by first-seen and include attachments", () => {
  const files = [
    file("10_notes/a.md", 100, 500),
    file("20_files/report.pdf", 200, 300),
    file("30_media/image.png", 300, 400),
  ];
  const index = {
    "10_notes/a.md": makeIndexedFile(files[0], "event", settings, 1000),
    "20_files/report.pdf": makeIndexedFile(files[1], "event", settings, 3000),
    "30_media/image.png": makeIndexedFile(files[2], "event", settings, 2000),
  };
  const display = buildDisplayFiles(files, index, settings);
  assert.deepEqual(display.map((entry) => entry.path), [
    "20_files/report.pdf",
    "30_media/image.png",
    "10_notes/a.md",
  ]);
});

test("display files can be built from a bounded index without a vault file scan", () => {
  const files = {};
  for (let index = 0; index < MAX_INDEX_ENTRIES + 50; index += 1) {
    const entry = makeIndexedFile(file(`20_files/file-${index}.pdf`, index, index), "event", settings, index);
    files[entry.path] = entry;
  }
  const trimmed = trimIndex(files, settings);
  const display = buildDisplayFilesFromIndex(trimmed, settings);
  assert.equal(Object.keys(trimmed).length, MAX_INDEX_ENTRIES);
  assert.equal(display.length, settings.maxItems);
  assert.equal(display[0].path, `20_files/file-${MAX_INDEX_ENTRIES + 49}.pdf`);
});

test("modified sort uses mtime instead of first-seen", () => {
  const modifiedSettings = normalizeSettings({ ...settings, sortMode: "modified" });
  const files = [file("old-created.md", 100, 5000), file("new-created.pdf", 2000, 3000)];
  const index = {
    "old-created.md": makeIndexedFile(files[0], "event", modifiedSettings, 100),
    "new-created.pdf": makeIndexedFile(files[1], "event", modifiedSettings, 2000),
  };
  const display = buildDisplayFiles(files, index, modifiedSettings);
  assert.equal(display[0].path, "old-created.md");
});

test("formats file sizes", () => {
  assert.equal(formatFileSize(42), "42 B");
  assert.equal(formatFileSize(1536), "1.5 KB");
  assert.equal(formatFileSize(2 * 1024 * 1024), "2.0 MB");
});
