#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const PLUGIN_ID = "newest-files";
const TEST_VAULT_NAME = "obsidian-test-vault";
const DEFAULT_TARGET = `/mnt/c/Users/viggo/github/${TEST_VAULT_NAME}/.obsidian/plugins/${PLUGIN_ID}`;
const ARTIFACTS = ["main.js", "manifest.json", "styles.css"];

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

const target = path.resolve(String(args.target ?? process.env.NEWEST_FILES_TEST_VAULT_PLUGIN_DIR ?? DEFAULT_TARGET));
const dryRun = Boolean(args["dry-run"]);

await assertSafeTarget(target);
runBuild();
await copyArtifacts(target, dryRun);

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      parsed["dry-run"] = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      throw new Error(`Unknown positional argument: ${arg}`);
    }
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    const value = inlineValue ?? rawArgs[index + 1];
    if (inlineValue === undefined) index += 1;
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    parsed[key] = value;
  }
  return parsed;
}

async function assertSafeTarget(targetPath) {
  const normalized = targetPath.replaceAll("\\", "/").toLowerCase();
  if (normalized.includes("syncthing/vault")) {
    throw new Error(`Refusing to sync into main Syncthing vault path: ${targetPath}`);
  }
  if (!normalized.includes(`/${TEST_VAULT_NAME}/.obsidian/plugins/${PLUGIN_ID}`)) {
    throw new Error(
      `Refusing unsafe target. Expected a ${TEST_VAULT_NAME}/.obsidian/plugins/${PLUGIN_ID} path, got: ${targetPath}`,
    );
  }

  const vaultRoot = targetPath.slice(0, targetPath.indexOf(`${TEST_VAULT_NAME}`) + TEST_VAULT_NAME.length);
  const vaultStat = await fs.stat(vaultRoot).catch(() => null);
  if (!vaultStat?.isDirectory()) {
    throw new Error(`Test vault root does not exist or is not a directory: ${vaultRoot}`);
  }
}

function runBuild() {
  const result = spawnSync("npm", ["run", "build"], { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    throw new Error(`npm run build failed with exit code ${result.status ?? "unknown"}`);
  }
}

async function copyArtifacts(targetPath, dryRun) {
  await fs.mkdir(targetPath, { recursive: true });

  const copied = [];
  for (const artifact of ARTIFACTS) {
    const source = path.resolve(artifact);
    const destination = path.join(targetPath, artifact);
    const sourceStat = await fs.stat(source).catch(() => null);
    if (!sourceStat?.isFile()) {
      throw new Error(`Missing runtime artifact after build: ${source}`);
    }
    if (!dryRun) {
      await fs.copyFile(source, destination);
    }
    copied.push({ artifact, source, destination, bytes: sourceStat.size });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun,
        pluginId: PLUGIN_ID,
        target: targetPath,
        copied,
      },
      null,
      2,
    ),
  );
}

function printHelp() {
  console.log(`Usage: npm run sync:test-vault -- [--target /path/to/obsidian-test-vault/.obsidian/plugins/newest-files] [--dry-run]\n\nBuilds Newest Files and copies main.js, manifest.json, and styles.css into the Windows-local obsidian-test-vault plugin folder.\nRefuses targets containing Syncthing/vault or targets that are not inside obsidian-test-vault/.obsidian/plugins/newest-files.\nDefault target: ${DEFAULT_TARGET}\n`);
}
