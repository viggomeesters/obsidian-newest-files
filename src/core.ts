export type SortMode = "first-seen" | "modified";
export type BackfillTimestamp = "created" | "modified";

export interface NewestFilesSettings {
  maxItems: number;
  excludedPaths: string;
  extensionFilter: string;
  sortMode: SortMode;
  backfillTimestamp: BackfillTimestamp;
  showBackfillBadges: boolean;
  showTimestamps: boolean;
}

export interface IndexedFile {
  path: string;
  firstSeen: number;
  firstSeenSource: "event" | "backfill";
  ctime: number;
  mtime: number;
  size: number;
}

export interface FileLike {
  path: string;
  name: string;
  extension: string;
  stat: {
    ctime: number;
    mtime: number;
    size: number;
  };
}

export interface DisplayFile {
  path: string;
  name: string;
  extension: string;
  folder: string;
  firstSeen: number;
  firstSeenSource: "event" | "backfill";
  ctime: number;
  mtime: number;
  size: number;
  sortTime: number;
}

export const MAX_INDEX_ENTRIES = 5000;

export const DEFAULT_SETTINGS: NewestFilesSettings = {
  maxItems: 50,
  excludedPaths: [
    ".obsidian/",
    ".trash/",
    ".git/",
    "node_modules/",
    "system/memory/",
    ".codex/",
    ".claude/",
    ".pytest_cache/",
    ".ruff_cache/",
    ".tmp/",
    ".tmp_whisper/",
  ].join("\n"),
  extensionFilter: "",
  sortMode: "first-seen",
  backfillTimestamp: "created",
  showBackfillBadges: true,
  showTimestamps: true,
};

export function normalizeSettings(input: Partial<NewestFilesSettings> | null | undefined): NewestFilesSettings {
  const settings = { ...DEFAULT_SETTINGS, ...(input ?? {}) };
  const maxItems = Number.isFinite(settings.maxItems) ? Math.floor(settings.maxItems) : DEFAULT_SETTINGS.maxItems;
  return {
    ...settings,
    maxItems: clamp(maxItems, 1, 500),
    sortMode: settings.sortMode === "modified" ? "modified" : "first-seen",
    backfillTimestamp: settings.backfillTimestamp === "modified" ? "modified" : "created",
    showBackfillBadges: Boolean(settings.showBackfillBadges),
    showTimestamps: settings.showTimestamps !== false,
  };
}

export function parsePathList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseExtensionFilter(value: string): Set<string> {
  return new Set(
    value
      .split(/[\s,]+/)
      .map((part) => part.trim().toLowerCase().replace(/^\./, ""))
      .filter(Boolean),
  );
}

export function isExcludedPath(path: string, excludedPaths: string): boolean {
  const normalizedPath = normalizePath(path);
  return parsePathList(excludedPaths).some((excluded) => {
    const normalizedExcluded = normalizePath(excluded);
    if (!normalizedExcluded) return false;
    if (normalizedExcluded.endsWith("/")) return normalizedPath.startsWith(normalizedExcluded);
    return normalizedPath === normalizedExcluded || normalizedPath.startsWith(`${normalizedExcluded}/`);
  });
}

export function shouldDisplayFile(file: FileLike, settings: NewestFilesSettings): boolean {
  if (isExcludedPath(file.path, settings.excludedPaths)) return false;
  if (isGeneratedSidecar(file.path)) return false;

  const extensions = parseExtensionFilter(settings.extensionFilter);
  if (extensions.size === 0) return true;

  const extension = getExtension(file.path);
  return extensions.has(extension);
}

export function makeIndexedFile(
  file: FileLike,
  source: IndexedFile["firstSeenSource"],
  settings: NewestFilesSettings,
  now: number,
): IndexedFile {
  const fallbackTime = settings.backfillTimestamp === "modified" ? file.stat.mtime : file.stat.ctime;
  return {
    path: file.path,
    firstSeen: source === "event" ? now : fallbackTime,
    firstSeenSource: source,
    ctime: file.stat.ctime,
    mtime: file.stat.mtime,
    size: file.stat.size,
  };
}

export function updateIndexedMetadata(existing: IndexedFile, file: FileLike): IndexedFile {
  return {
    ...existing,
    path: file.path,
    ctime: file.stat.ctime,
    mtime: file.stat.mtime,
    size: file.stat.size,
  };
}

export function indexedFileToFileLike(indexed: IndexedFile): FileLike {
  const name = indexed.path.split("/").pop() ?? indexed.path;
  return {
    path: indexed.path,
    name,
    extension: getExtension(indexed.path),
    stat: {
      ctime: indexed.ctime,
      mtime: indexed.mtime,
      size: indexed.size,
    },
  };
}

export function sortIndexedFiles(index: Record<string, IndexedFile>, settings: NewestFilesSettings): IndexedFile[] {
  return Object.values(index)
    .filter((indexed) => shouldDisplayFile(indexedFileToFileLike(indexed), settings))
    .sort((a, b) => {
      const aTime = settings.sortMode === "modified" ? a.mtime : a.firstSeen;
      const bTime = settings.sortMode === "modified" ? b.mtime : b.firstSeen;
      if (bTime !== aTime) return bTime - aTime;
      return a.path.localeCompare(b.path);
    });
}

export function trimIndex(
  index: Record<string, IndexedFile>,
  settings: NewestFilesSettings,
  limit = MAX_INDEX_ENTRIES,
): Record<string, IndexedFile> {
  const trimmed: Record<string, IndexedFile> = {};
  for (const indexed of sortIndexedFiles(index, settings).slice(0, limit)) {
    trimmed[indexed.path] = indexed;
  }
  return trimmed;
}

export function buildDisplayFilesFromIndex(
  index: Record<string, IndexedFile>,
  settings: NewestFilesSettings,
): DisplayFile[] {
  return buildDisplayFiles(
    sortIndexedFiles(index, settings).map(indexedFileToFileLike),
    index,
    settings,
  );
}

export function buildDisplayFiles(
  files: FileLike[],
  index: Record<string, IndexedFile>,
  settings: NewestFilesSettings,
): DisplayFile[] {
  return files
    .filter((file) => shouldDisplayFile(file, settings))
    .map((file) => {
      const indexed = index[file.path] ?? makeIndexedFile(file, "backfill", settings, Date.now());
      const sortTime = settings.sortMode === "modified" ? indexed.mtime : indexed.firstSeen;
      return {
        path: file.path,
        name: file.name,
        extension: getExtension(file.path),
        folder: getFolder(file.path),
        firstSeen: indexed.firstSeen,
        firstSeenSource: indexed.firstSeenSource,
        ctime: indexed.ctime,
        mtime: indexed.mtime,
        size: indexed.size,
        sortTime,
      };
    })
    .sort(compareDisplayFiles)
    .slice(0, settings.maxItems);
}

export function compareDisplayFiles(a: DisplayFile, b: DisplayFile): number {
  if (b.sortTime !== a.sortTime) return b.sortTime - a.sortTime;
  return a.path.localeCompare(b.path);
}

export function getExtension(path: string): string {
  const name = path.split("/").pop() ?? path;
  const index = name.lastIndexOf(".");
  if (index <= 0 || index === name.length - 1) return "";
  return name.slice(index + 1).toLowerCase();
}

export function getFolder(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "/" : path.slice(0, index);
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function isGeneratedSidecar(path: string): boolean {
  const normalized = normalizePath(path).toLowerCase();
  return [".sqlite-wal", ".sqlite-shm", ".db-wal", ".db-shm"].some((suffix) => normalized.endsWith(suffix));
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
