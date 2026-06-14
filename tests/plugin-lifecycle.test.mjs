import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

class FakeElement {
  constructor(tag = "div", options = {}) {
    this.tag = tag;
    this.children = [];
    this.classes = new Set();
    this.attributes = {};
    this.listeners = {};
    this.text = options.text ?? "";
    this.type = "";
    this.value = "";
    this.min = "";
    this.max = "";
    this.rows = 0;
  }

  empty() {
    this.children = [];
    this.text = "";
  }

  addClass(...classes) {
    for (const cls of classes) this.classes.add(cls);
  }

  setText(text) {
    this.text = text;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  addEventListener(type, callback) {
    this.listeners[type] = callback;
  }

  createDiv(options = {}) {
    return this.createEl("div", options);
  }

  createSpan(options = {}) {
    return this.createEl("span", options);
  }

  createEl(tag, options = {}) {
    const child = new FakeElement(tag, options);
    if (options.cls) {
      for (const cls of String(options.cls).split(/\s+/).filter(Boolean)) child.addClass(cls);
    }
    if (options.attr) {
      for (const [key, value] of Object.entries(options.attr)) child.setAttribute(key, String(value));
    }
    this.children.push(child);
    return child;
  }

  textContent() {
    return [this.text, ...this.children.map((child) => child.textContent())].filter(Boolean).join(" ");
  }
}

class FakeTFile {
  constructor(path, ctime, mtime = ctime, size = 100) {
    this.setPath(path);
    this.stat = { ctime, mtime, size };
  }

  setPath(path) {
    this.path = path;
    this.name = path.split("/").pop();
    const dot = this.name.lastIndexOf(".");
    this.extension = dot > -1 ? this.name.slice(dot + 1).toLowerCase() : "";
    this.basename = dot > -1 ? this.name.slice(0, dot) : this.name;
  }
}

class FakeVault extends EventEmitter {
  constructor(files = []) {
    super();
    this.files = new Map(files.map((file) => [file.path, file]));
    this.getFilesCallCount = 0;
  }

  getFiles() {
    this.getFilesCallCount += 1;
    return [...this.files.values()];
  }

  getAbstractFileByPath(path) {
    return this.files.get(path) ?? null;
  }

  create(path, size = 100) {
    const file = new FakeTFile(path, Date.now(), Date.now(), size);
    this.files.set(path, file);
    this.emit("create", file);
    return file;
  }

  modify(path, size) {
    const file = this.files.get(path);
    assert.ok(file, `missing file for modify: ${path}`);
    file.stat = { ...file.stat, mtime: Date.now(), size };
    this.emit("modify", file);
    return file;
  }

  rename(oldPath, newPath) {
    const file = this.files.get(oldPath);
    assert.ok(file, `missing file for rename: ${oldPath}`);
    this.files.delete(oldPath);
    file.setPath(newPath);
    file.stat = { ...file.stat, mtime: Date.now() };
    this.files.set(newPath, file);
    this.emit("rename", file, oldPath);
    return file;
  }

  delete(path) {
    const file = this.files.get(path);
    assert.ok(file, `missing file for delete: ${path}`);
    this.files.delete(path);
    this.emit("delete", file);
  }
}

class FakeLeaf {
  constructor(workspace) {
    this.workspace = workspace;
    this.view = null;
    this.openedFile = null;
  }

  async setViewState(state) {
    const factory = this.workspace.factories.get(state.type);
    assert.ok(factory, `missing view factory for ${state.type}`);
    this.view = factory(this);
    if (!this.workspace.leaves.includes(this)) this.workspace.leaves.push(this);
    await this.view.onOpen?.();
  }

  async openFile(file) {
    this.openedFile = file;
  }
}

class FakeWorkspace {
  constructor() {
    this.factories = new Map();
    this.leaves = [];
    this.revealedLeaf = null;
  }

  getLeavesOfType(type) {
    return this.leaves.filter((leaf) => leaf.view?.getViewType?.() === type);
  }

  getRightLeaf() {
    const leaf = new FakeLeaf(this);
    this.leaves.push(leaf);
    return leaf;
  }

  getLeaf() {
    const leaf = new FakeLeaf(this);
    this.leaves.push(leaf);
    return leaf;
  }

  revealLeaf(leaf) {
    this.revealedLeaf = leaf;
  }

  detachLeavesOfType(type) {
    this.leaves = this.leaves.filter((leaf) => leaf.view?.getViewType?.() !== type);
  }
}

class FakePlugin {
  constructor(app) {
    this.app = app;
  }

  async loadData() {
    return this.app.savedData ?? null;
  }

  async saveData(data) {
    this.app.savedData = data;
  }

  registerView(type, factory) {
    this.app.workspace.factories.set(type, factory);
  }

  registerEvent() {}

  addRibbonIcon(id, title, callback) {
    this.app.ribbon = { id, title, callback };
  }

  addCommand(command) {
    this.app.commands.set(`newest-files:${command.id}`, command);
  }

  addSettingTab(tab) {
    this.app.settingTab = tab;
  }
}

class FakeItemView {
  constructor(leaf) {
    this.leaf = leaf;
    this.contentEl = new FakeElement();
  }
}

class FakePluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = new FakeElement();
  }
}

class FakeSetting {
  constructor(containerEl) {
    this.containerEl = containerEl;
  }

  setName() {
    return this;
  }

  setDesc() {
    return this;
  }

  setHeading() {
    return this;
  }

  addText(callback) {
    callback(fakeTextControl());
    return this;
  }

  addTextArea(callback) {
    callback(fakeTextControl());
    return this;
  }

  addDropdown(callback) {
    callback(fakeDropdownControl());
    return this;
  }

  addToggle(callback) {
    callback(fakeToggleControl());
    return this;
  }

  addButton(callback) {
    callback({ setButtonText: () => ({ onClick: () => undefined }) });
    return this;
  }
}

function fakeTextControl() {
  return {
    inputEl: new FakeElement("input"),
    setValue: () => fakeTextControl(),
    setPlaceholder: () => fakeTextControl(),
    onChange: () => fakeTextControl(),
  };
}

function fakeDropdownControl() {
  return {
    addOption: () => fakeDropdownControl(),
    setValue: () => fakeDropdownControl(),
    onChange: () => fakeDropdownControl(),
  };
}

function fakeToggleControl() {
  return {
    setValue: () => fakeToggleControl(),
    onChange: () => fakeToggleControl(),
  };
}

function createFakeObsidianModule() {
  return {
    ItemView: FakeItemView,
    Notice: class FakeNotice {},
    Plugin: FakePlugin,
    PluginSettingTab: FakePluginSettingTab,
    Setting: FakeSetting,
    TFile: FakeTFile,
    moment: (timestamp) => ({
      fromNow: () => "just now",
      format: () => new Date(timestamp).toISOString().slice(0, 16).replace("T", " "),
    }),
    setIcon: (element, icon) => {
      element.icon = icon;
    },
  };
}

function loadPluginClass() {
  const Module = require("node:module");
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "obsidian") return createFakeObsidianModule();
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve("../dist/main.cjs")];
    return require("../dist/main.cjs").default;
  } finally {
    Module._load = originalLoad;
  }
}

function makeApp(files = [], savedData = null) {
  return {
    commands: new Map(),
    savedData,
    vault: new FakeVault(files),
    workspace: new FakeWorkspace(),
  };
}

async function flushSaveTimers() {
  await new Promise((resolve) => setTimeout(resolve, 400));
}

function countByClass(element, className) {
  const own = element.classes.has(className) ? 1 : 0;
  return own + element.children.reduce((total, child) => total + countByClass(child, className), 0);
}

test("plugin lifecycle indexes, renders, filters, opens, updates, and persists newest files", async () => {
  globalThis.window = globalThis;
  const originalNow = Date.now;
  let now = 1_000_000;
  Date.now = () => {
    now += 1_000;
    return now;
  };

  try {
    const NewestFilesPlugin = loadPluginClass();
    const initialFiles = [
      new FakeTFile("notes/existing.md", 100, 200, 50),
      new FakeTFile("files/existing.pdf", 150, 250, 75),
    ];
    const app = makeApp(initialFiles);
    const plugin = new NewestFilesPlugin(app);

    await plugin.onload();
    assert.ok(app.commands.has("newest-files:open-newest-files-view"));
    assert.ok(app.commands.has("newest-files:rebuild-newest-files-index"));
    assert.equal(app.vault.getFilesCallCount, 0);
    assert.equal(plugin.files["notes/existing.md"], undefined);

    const md = app.vault.create("notes/live.md", 120);
    const pdf = app.vault.create("files/report.pdf", 240);
    const png = app.vault.create("media/image.png", 360);
    const xlsx = app.vault.create("files/sheet.xlsx", 480);

    assert.equal(plugin.files[md.path].firstSeenSource, "event");
    assert.equal(plugin.files[pdf.path].firstSeenSource, "event");
    assert.equal(plugin.files[png.path].firstSeenSource, "event");
    assert.equal(plugin.files[xlsx.path].firstSeenSource, "event");

    await plugin.activateView();
    const viewText = app.workspace.leaves[0].view.contentEl.textContent();
    assert.match(viewText, /Newest Files/);
    assert.doesNotMatch(viewText, /shown/);
    assert.doesNotMatch(viewText, /First-seen sort/);
    assert.match(viewText, /sheet/);
    assert.match(viewText, /XLSX/);
    assert.match(viewText, /report/);
    assert.match(viewText, /PDF/);
    assert.ok(countByClass(app.workspace.leaves[0].view.contentEl, "newest-files__time") > 0);

    await plugin.openPath("files/report.pdf");
    const openedLeaf = app.workspace.leaves.find((leaf) => leaf.openedFile);
    assert.equal(openedLeaf.openedFile.path, "files/report.pdf");

    await plugin.updateSettings({ showTimestamps: false });
    assert.equal(countByClass(app.workspace.leaves[0].view.contentEl, "newest-files__time"), 0);
    assert.ok(countByClass(app.workspace.leaves[0].view.contentEl, "newest-files__item--no-time") > 0);

    await plugin.updateSettings({ extensionFilter: "pdf png xlsx", maxItems: 10 });
    assert.deepEqual(
      plugin.getDisplayFiles().map((file) => file.path),
      ["files/sheet.xlsx", "media/image.png", "files/report.pdf"],
    );

    const firstSeenBeforeRename = plugin.files["files/report.pdf"].firstSeen;
    app.vault.rename("files/report.pdf", "files/report-renamed.pdf");
    assert.equal(plugin.files["files/report-renamed.pdf"].firstSeen, firstSeenBeforeRename);
    assert.equal(plugin.files["files/report.pdf"], undefined);

    app.vault.modify("files/sheet.xlsx", 2048);
    assert.equal(plugin.files["files/sheet.xlsx"].size, 2048);

    app.vault.delete("media/image.png");
    assert.equal(plugin.files["media/image.png"], undefined);
    assert.equal(plugin.getDisplayFiles().some((file) => file.path === "media/image.png"), false);

    await plugin.savePluginData();
    assert.equal(app.savedData.files["files/report-renamed.pdf"].firstSeen, firstSeenBeforeRename);
    assert.equal(app.savedData.settings.extensionFilter, "pdf png xlsx");

    const reloaded = new NewestFilesPlugin(makeApp(app.vault.getFiles(), app.savedData));
    await reloaded.onload();
    assert.equal(reloaded.app.vault.getFilesCallCount, 0);
    assert.equal(reloaded.files["files/report-renamed.pdf"].firstSeen, firstSeenBeforeRename);
    assert.equal(reloaded.settings.extensionFilter, "pdf png xlsx");
  } finally {
    Date.now = originalNow;
  }
});

test("startup keeps large legacy indexes bounded and lazy", async () => {
  globalThis.window = globalThis;
  const NewestFilesPlugin = loadPluginClass();
  const files = {};
  for (let index = 0; index < 100_000; index += 1) {
    files[`20_files/file-${index}.pdf`] = {
      path: `20_files/file-${index}.pdf`,
      firstSeen: index,
      firstSeenSource: "event",
      ctime: index,
      mtime: index,
      size: index,
    };
  }
  const app = makeApp([], {
    settings: { maxItems: 50 },
    files,
  });
  const plugin = new NewestFilesPlugin(app);

  await plugin.onload();

  assert.equal(app.vault.getFilesCallCount, 0);
  assert.equal(Object.keys(plugin.files).length, 5_000);
  assert.equal(plugin.getDisplayFiles().length, 0);
});

test("manual rebuild is explicit and persists a bounded index", async () => {
  globalThis.window = globalThis;
  const NewestFilesPlugin = loadPluginClass();
  const files = [];
  for (let index = 0; index < 6_000; index += 1) {
    files.push(new FakeTFile(`20_files/file-${index}.pdf`, index, index, index));
  }
  files.push(new FakeTFile("system/memory/raw.jsonl", 10_000, 10_000, 10));
  files.push(new FakeTFile(".obsidian/plugins/x/main.js", 10_001, 10_001, 10));
  files.push(new FakeTFile("system/index.sqlite-wal", 10_002, 10_002, 10));
  const app = makeApp(files);
  const plugin = new NewestFilesPlugin(app);

  await plugin.onload();
  assert.equal(app.vault.getFilesCallCount, 0);

  await plugin.rebuildBackfillIndex();

  assert.equal(app.vault.getFilesCallCount, 1);
  assert.equal(Object.keys(plugin.files).length, 5_000);
  assert.equal(plugin.files["system/memory/raw.jsonl"], undefined);
  assert.equal(plugin.files[".obsidian/plugins/x/main.js"], undefined);
  assert.equal(plugin.files["system/index.sqlite-wal"], undefined);
  assert.equal(Object.keys(app.savedData.files).length, 5_000);
});
