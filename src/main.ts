import {
  App,
  ItemView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  TFile,
  WorkspaceLeaf,
  moment,
  setIcon,
} from "obsidian";
import {
  DEFAULT_SETTINGS,
  DisplayFile,
  IndexedFile,
  NewestFilesSettings,
  MAX_INDEX_ENTRIES,
  buildDisplayFilesFromIndex,
  makeIndexedFile,
  normalizeSettings,
  shouldDisplayFile,
  trimIndex,
  updateIndexedMetadata,
} from "./core";

const VIEW_TYPE_NEWEST_FILES = "newest-files-view";
const SAVE_DELAY_MS = 1_000;
const REFRESH_DELAY_MS = 120;
const REBUILD_CHUNK_SIZE = 250;

interface NewestFilesPluginData {
  settings?: Partial<NewestFilesSettings>;
  files?: Record<string, IndexedFile>;
}

export default class NewestFilesPlugin extends Plugin {
  settings: NewestFilesSettings = DEFAULT_SETTINGS;
  files: Record<string, IndexedFile> = {};
  private saveTimer: number | null = null;
  private refreshTimer: number | null = null;
  private pruneTimer: number | null = null;
  private eventsRegistered = false;

  async onload(): Promise<void> {
    await this.loadPluginData();

    this.registerView(VIEW_TYPE_NEWEST_FILES, (leaf) => new NewestFilesView(leaf, this));

    this.addRibbonIcon("list-plus", "Open Newest Files", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-newest-files-view",
      name: "Open Newest Files view",
      callback: () => {
        void this.activateView();
      },
    });

    this.addCommand({
      id: "rebuild-newest-files-index",
      name: "Rebuild Newest Files index",
      callback: () => {
        void this.rebuildBackfillIndex();
      },
    });

    this.addSettingTab(new NewestFilesSettingTab(this.app, this));

    this.initializeEvents();
  }

  onunload(): void {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.pruneTimer !== null) {
      window.clearTimeout(this.pruneTimer);
      this.pruneTimer = null;
    }
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_NEWEST_FILES);
  }

  async loadPluginData(): Promise<void> {
    const data = (await this.loadData()) as NewestFilesPluginData | null;
    this.settings = normalizeSettings(data?.settings);
    this.files = trimIndex(data?.files ?? {}, this.settings);
  }

  async savePluginData(): Promise<void> {
    this.files = trimIndex(this.files, this.settings);
    await this.saveData({
      settings: this.settings,
      files: this.files,
    } satisfies NewestFilesPluginData);
  }

  queueSave(): void {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
    }
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.savePluginData();
    }, SAVE_DELAY_MS);
  }

  queuePruneAndSave(): void {
    if (this.pruneTimer !== null) return;
    this.pruneTimer = window.setTimeout(() => {
      this.pruneTimer = null;
      this.files = trimIndex(this.files, this.settings);
      this.queueSave();
    }, SAVE_DELAY_MS);
  }

  async activateView(): Promise<void> {
    const existingLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_NEWEST_FILES)[0];
    const leaf = existingLeaf ?? this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(false);
    await leaf.setViewState({ type: VIEW_TYPE_NEWEST_FILES, active: true });
    this.app.workspace.revealLeaf(leaf);
    this.refreshViews();
  }

  initializeEvents(): void {
    if (this.eventsRegistered) return;

    this.registerVaultEvents();
    this.eventsRegistered = true;
  }

  async backfillMissingFiles(): Promise<void> {
    await this.rebuildBackfillIndex();
  }

  async rebuildBackfillIndex(): Promise<void> {
    const nextIndex: Record<string, IndexedFile> = {};
    const files = this.app.vault.getFiles();

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (shouldDisplayFile(file, this.settings)) {
        nextIndex[file.path] = makeIndexedFile(file, "backfill", this.settings, Date.now());
      }

      if (index > 0 && index % REBUILD_CHUNK_SIZE === 0) {
        await yieldToEventLoop();
      }
    }

    this.files = trimIndex(nextIndex, this.settings);
    await this.savePluginData();
    this.renderViewsNow();
    new Notice(`Newest Files index rebuilt from vault file metadata. Kept ${Object.keys(this.files).length} files.`);
  }

  getDisplayFiles(): DisplayFile[] {
    this.pruneMissingIndexedFiles();
    return buildDisplayFilesFromIndex(this.files, this.settings);
  }

  async openPath(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice(`File not found: ${path}`);
      return;
    }

    await this.app.workspace.getLeaf(false).openFile(file);
  }

  refreshViews(): void {
    if (this.refreshTimer !== null) return;
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_NEWEST_FILES)) {
        if (leaf.view instanceof NewestFilesView) {
          leaf.view.render();
        }
      }
    }, REFRESH_DELAY_MS);
  }

  renderViewsNow(): void {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_NEWEST_FILES)) {
      if (leaf.view instanceof NewestFilesView) {
        leaf.view.render();
      }
    }
  }

  async updateSettings(nextSettings: Partial<NewestFilesSettings>): Promise<void> {
    this.settings = normalizeSettings({ ...this.settings, ...nextSettings });
    this.files = trimIndex(this.files, this.settings);
    await this.savePluginData();
    this.renderViewsNow();
  }

  private handleCreate(file: TAbstractFile): void {
    if (!(file instanceof TFile)) return;
    if (!shouldDisplayFile(file, this.settings)) return;

    const existing = this.files[file.path];
    this.files[file.path] = existing
      ? updateIndexedMetadata(existing, file)
      : makeIndexedFile(file, "event", this.settings, Date.now());
    this.queuePruneAndSave();
    this.refreshViews();
  }

  private handleDelete(file: TAbstractFile): void {
    if (!(file instanceof TFile)) return;

    delete this.files[file.path];
    this.queueSave();
    this.refreshViews();
  }

  private handleRename(file: TAbstractFile, oldPath: string): void {
    if (!(file instanceof TFile)) return;

    const existing = this.files[oldPath];
    delete this.files[oldPath];
    if (!shouldDisplayFile(file, this.settings)) {
      this.queueSave();
      this.refreshViews();
      return;
    }

    if (existing) {
      this.files[file.path] = updateIndexedMetadata({ ...existing, path: file.path }, file);
    } else {
      this.files[file.path] = makeIndexedFile(file, "event", this.settings, Date.now());
    }
    this.queuePruneAndSave();
    this.refreshViews();
  }

  private handleModify(file: TAbstractFile): void {
    if (!(file instanceof TFile)) return;
    if (!shouldDisplayFile(file, this.settings)) {
      delete this.files[file.path];
      this.queueSave();
      this.refreshViews();
      return;
    }

    const existing = this.files[file.path];
    if (!existing) {
      this.files[file.path] = makeIndexedFile(file, "event", this.settings, Date.now());
    } else {
      this.files[file.path] = updateIndexedMetadata(existing, file);
    }
    this.queuePruneAndSave();
    this.refreshViews();
  }

  private queueMissingFilePrune(): void {
    if (this.pruneTimer !== null) return;
    this.pruneTimer = window.setTimeout(() => {
      this.pruneTimer = null;
      this.pruneMissingIndexedFiles();
    }, SAVE_DELAY_MS);
  }

  private pruneMissingIndexedFiles(): void {
    let changed = false;

    for (const path of Object.keys(this.files)) {
      if (!(this.app.vault.getAbstractFileByPath(path) instanceof TFile)) {
        delete this.files[path];
        changed = true;
      }
    }

    if (changed) {
      this.queueSave();
    }
  }

  private registerVaultEvents(): void {
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        this.handleCreate(file);
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.handleDelete(file);
      }),
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.handleRename(file, oldPath);
      }),
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        this.handleModify(file);
      }),
    );
  }
}

class NewestFilesView extends ItemView {
  private readonly plugin: NewestFilesPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: NewestFilesPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_NEWEST_FILES;
  }

  getDisplayText(): string {
    return "Newest Files";
  }

  getIcon(): string {
    return "list-plus";
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("newest-files");

    const header = container.createDiv({ cls: "newest-files__header" });
    const title = header.createDiv({ cls: "newest-files__title" });
    title.createSpan({ text: "Newest Files" });

    const actions = header.createDiv({ cls: "newest-files__actions" });
    const refreshButton = actions.createEl("button", {
      cls: "clickable-icon newest-files__icon-button",
      attr: { "aria-label": "Refresh newest files", title: "Refresh", type: "button" },
    });
    setIcon(refreshButton, "refresh-cw");
    refreshButton.addEventListener("click", () => {
      void this.plugin.rebuildBackfillIndex();
    });

    const files = this.plugin.getDisplayFiles();

    if (files.length === 0) {
      container.createDiv({ cls: "newest-files__empty", text: "No matching files." });
      return;
    }

    const list = container.createDiv({ cls: "newest-files__list" });
    for (const file of files) {
      this.renderItem(list, file);
    }
  }

  private renderItem(list: HTMLElement, file: DisplayFile): void {
    const itemClasses = this.plugin.settings.showTimestamps
      ? "newest-files__item"
      : "newest-files__item newest-files__item--no-time";
    const item = list.createEl("button", {
      cls: itemClasses,
      attr: { type: "button", title: file.path },
    });
    item.addEventListener("click", () => {
      void this.plugin.openPath(file.path);
    });

    if (this.plugin.settings.showTimestamps) {
      item.createSpan({ cls: "newest-files__time", text: formatListTime(file.sortTime) });
    }
    item.createSpan({ cls: "newest-files__name", text: displayName(file.name, file.extension) });
    if (file.extension) {
      item.createSpan({ cls: "newest-files__extension", text: file.extension.toUpperCase() });
    }
  }
}

class NewestFilesSettingTab extends PluginSettingTab {
  private readonly plugin: NewestFilesPlugin;

  constructor(app: App, plugin: NewestFilesPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("newest-files-settings");
    containerEl.createEl("h2", { text: "Newest Files" });

    new Setting(containerEl)
      .setName("Maximum files")
      .setDesc("Number of files shown in the sidebar list.")
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.maxItems))
          .onChange((value) => {
            void this.plugin.updateSettings({ maxItems: Number(value) });
          });
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.inputEl.max = String(MAX_INDEX_ENTRIES);
      });

    new Setting(containerEl)
      .setName("Show timestamps")
      .setDesc("Show an HH:mm timestamp before each filename.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.showTimestamps).onChange((value) => {
          void this.plugin.updateSettings({ showTimestamps: value });
        });
      });

    new Setting(containerEl)
      .setName("Sort source")
      .setDesc("First-seen uses the plugin index; modified uses the current file metadata.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("first-seen", "First seen")
          .addOption("modified", "Modified")
          .setValue(this.plugin.settings.sortMode)
          .onChange((value) => {
            void this.plugin.updateSettings({ sortMode: value === "modified" ? "modified" : "first-seen" });
          });
      });

    new Setting(containerEl)
      .setName("Backfill timestamp")
      .setDesc("Timestamp used when existing files are first indexed.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("created", "Created")
          .addOption("modified", "Modified")
          .setValue(this.plugin.settings.backfillTimestamp)
          .onChange((value) => {
            void this.plugin.updateSettings({ backfillTimestamp: value === "modified" ? "modified" : "created" });
          });
      });

    new Setting(containerEl)
      .setName("Extension filter")
      .setDesc("Optional comma- or space-separated extensions, for example: md pdf png xlsx.")
      .addTextArea((text) => {
        text
          .setPlaceholder("Leave empty to show all file types")
          .setValue(this.plugin.settings.extensionFilter)
          .onChange((value) => {
            void this.plugin.updateSettings({ extensionFilter: value });
          });
      });

    new Setting(containerEl)
      .setName("Excluded paths")
      .setDesc("One path or path prefix per line. Prefixes ending in / exclude that folder.")
      .addTextArea((text) => {
        text
          .setPlaceholder(".obsidian/\n.trash/\nnode_modules/")
          .setValue(this.plugin.settings.excludedPaths)
          .onChange((value) => {
            void this.plugin.updateSettings({ excludedPaths: value });
          });
        text.inputEl.rows = 5;
      });

    new Setting(containerEl)
      .setName("Rebuild index")
      .setDesc("Replace the bounded first-seen index with current vault file metadata.")
      .addButton((button) => {
        button.setButtonText("Rebuild").onClick(() => {
          void this.plugin.rebuildBackfillIndex();
        });
      });
  }
}

function formatListTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  return moment(timestamp).format("HH:mm");
}

function displayName(name: string, extension: string): string {
  if (!extension) return name;
  const suffix = `.${extension}`;
  return name.toLowerCase().endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}

async function yieldToEventLoop(): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}
