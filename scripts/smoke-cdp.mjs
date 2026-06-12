#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_PORT = 9222;
const PLUGIN_ID = "newest-files";
const VIEW_TYPE = "newest-files-view";
const TEST_VAULT_NAME = "obsidian-test-vault";

async function main() {
  if (shouldDelegateToWindowsNode()) {
    runWithWindowsNode();
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  const port = Number(args.port ?? process.env.OBSIDIAN_CDP_PORT ?? DEFAULT_PORT);
  const host = String(args.host ?? process.env.OBSIDIAN_CDP_HOST ?? "127.0.0.1");
  const screenshotPath = String(
    args.screenshot ?? process.env.OBSIDIAN_CDP_SCREENSHOT ?? `/tmp/${PLUGIN_ID}-cdp-smoke-${timestampForFile()}.png`,
  );

  if (args.help) {
    printHelp();
    return;
  }

  try {
    const target = await findObsidianTarget(host, port);
    const client = await CdpClient.connect(target.webSocketDebuggerUrl);
    try {
      await client.send("Runtime.enable");
      await client.send("Page.enable").catch(() => undefined);

      const result = await evaluateSmoke(client);
      if (!result.ok) {
        throw new Error(result.error ?? "Smoke script returned ok=false");
      }

      const screenshot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }).catch(() => null);
      if (screenshot?.data) {
        await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
        await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
        result.screenshot = screenshotPath;
      }

      console.log(JSON.stringify(result, null, 2));
    } finally {
      client.close();
    }
  } catch (error) {
    console.error(formatFailure(error, host, port));
    process.exit(1);
  }
}

function shouldDelegateToWindowsNode() {
  return process.platform === "linux" && os.release().toLowerCase().includes("microsoft") && !process.env.NEWEST_FILES_CDP_WINDOWS_NODE;
}

function runWithWindowsNode() {
  const scriptPath = path.resolve(process.argv[1]);
  const wslpath = spawnSync("wslpath", ["-w", scriptPath], { encoding: "utf8" });
  if (wslpath.status !== 0) {
    throw new Error(`wslpath failed: ${wslpath.stderr || wslpath.stdout}`);
  }
  const windowsScriptPath = wslpath.stdout.trim();
  const quotedArgs = [windowsScriptPath, ...process.argv.slice(2)].map(quotePowerShellString).join(", ");
  const command = `$env:NEWEST_FILES_CDP_WINDOWS_NODE='1'; node ${quotedArgs}`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

function quotePowerShellString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      throw new Error(`Unknown positional argument: ${arg}`);
    }
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    const value = inlineValue ?? rawArgs[index + 1];
    if (inlineValue === undefined) index += 1;
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    parsed[key] = value;
  }
  return parsed;
}

async function findObsidianTarget(host, port) {
  const response = await fetch(`http://${host}:${port}/json/list`);
  if (!response.ok) {
    throw new Error(`CDP endpoint returned ${response.status} ${response.statusText}`);
  }
  const targets = await response.json();
  const pages = targets.filter((target) => target.type === "page" && target.webSocketDebuggerUrl);
  const obsidian = pages.find((target) => /obsidian/i.test(`${target.title} ${target.url}`)) ?? pages[0];
  if (!obsidian) {
    throw new Error("No CDP page target found");
  }
  return obsidian;
}

async function evaluateSmoke(client) {
  const expression = `(${browserSmoke.toString()})(${JSON.stringify({ pluginId: PLUGIN_ID, viewType: VIEW_TYPE, testVaultName: TEST_VAULT_NAME })})`;
  const response = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: 60_000,
  });

  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text ?? JSON.stringify(response.exceptionDetails));
  }
  return response.result.value;
}

async function browserSmoke(config) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const assert = (condition, message, details = {}) => {
    if (!condition) {
      const error = new Error(message);
      error.details = details;
      throw error;
    }
  };
  const app = window.app;
  assert(app?.vault && app?.workspace, "Obsidian app object is not available on window.app");

  const vaultName = app.vault.getName?.() ?? "";
  assert(vaultName === config.testVaultName, "Wrong vault is open", { vaultName, expected: config.testVaultName });

  const plugin = app.plugins?.plugins?.[config.pluginId];
  const enabledPluginIds = Array.from(app.plugins?.enabledPlugins ?? []);
  assert(plugin, "Newest Files plugin is not loaded", { enabledPluginIds });

  const commandIds = Object.keys(app.commands?.commands ?? {}).filter((id) => id.includes(config.pluginId));
  const openCommandId = `${config.pluginId}:open-newest-files-view`;
  assert(commandIds.includes(openCommandId), "Open command is not registered", { commandIds, openCommandId });

  const smokeId = `cdp-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const folder = "cdp-smoke";
  const original = `${folder}/${smokeId}.md`;
  const renamed = `${folder}/${smokeId}-renamed.md`;
  const attachment = `${folder}/${smokeId}.txt`;

  if (!app.vault.getAbstractFileByPath(folder)) {
    await app.vault.createFolder(folder);
  }

  const oldOriginal = app.vault.getAbstractFileByPath(original);
  if (oldOriginal) await app.vault.delete(oldOriginal, true);
  const oldRenamed = app.vault.getAbstractFileByPath(renamed);
  if (oldRenamed) await app.vault.delete(oldRenamed, true);
  const oldAttachment = app.vault.getAbstractFileByPath(attachment);
  if (oldAttachment) await app.vault.delete(oldAttachment, true);

  const file = await app.vault.create(original, `# ${smokeId}\ncreated by CDP smoke\n`);
  const txt = await app.vault.create(attachment, `plain text fixture ${smokeId}\n`);
  await sleep(600);

  const executeCommand = app.commands.executeCommandById?.bind(app.commands);
  if (executeCommand) {
    executeCommand(openCommandId);
  } else if (plugin.activateView) {
    await plugin.activateView();
  }
  await sleep(900);

  const leavesAfterOpen = app.workspace.getLeavesOfType(config.viewType);
  assert(leavesAfterOpen.length > 0, "Newest Files view did not open", { leafCount: leavesAfterOpen.length });

  const refreshButton = document.querySelector('.newest-files [aria-label="Refresh newest files"]');
  assert(refreshButton, "Refresh button is not visible in the Newest Files view");
  refreshButton.click();
  await sleep(900);

  const visibleAfterCreate = visibleRows();
  assert(visibleAfterCreate.some((row) => row.title === original || row.text.includes(`${smokeId}.md`)), "Created Markdown file is not visible", { visibleAfterCreate, original });
  assert(visibleAfterCreate.some((row) => row.title === attachment || row.text.includes(`${smokeId}.txt`)), "Created non-Markdown file is not visible", { visibleAfterCreate, attachment });

  await app.vault.rename(file, renamed);
  await sleep(700);
  const visibleAfterRename = visibleRows();
  assert(visibleAfterRename.some((row) => row.title === renamed || row.text.includes(`${smokeId}-renamed.md`)), "Renamed file is not visible", { visibleAfterRename, renamed });
  assert(!visibleAfterRename.some((row) => row.title === original || row.text.includes(`${smokeId}.md`)), "Original filename remained visible after rename", { visibleAfterRename, original });

  const renamedFile = app.vault.getAbstractFileByPath(renamed);
  await app.vault.modify(renamedFile, `# ${smokeId}\nmodified by CDP smoke at ${new Date().toISOString()}\n`);
  await sleep(700);
  const visibleAfterModify = visibleRows();
  assert(visibleAfterModify.some((row) => row.title === renamed || row.text.includes(`${smokeId}-renamed.md`)), "Modified file disappeared from view", { visibleAfterModify, renamed });

  const txtFile = app.vault.getAbstractFileByPath(attachment);
  if (txtFile) await app.vault.delete(txtFile, true);
  const renamedForDelete = app.vault.getAbstractFileByPath(renamed);
  if (renamedForDelete) await app.vault.delete(renamedForDelete, true);
  await sleep(900);
  const visibleAfterDelete = visibleRows();
  assert(!visibleAfterDelete.some((row) => row.title === renamed || row.text.includes(`${smokeId}-renamed.md`)), "Deleted Markdown file remained visible", { visibleAfterDelete, renamed });
  assert(!visibleAfterDelete.some((row) => row.title === attachment || row.text.includes(`${smokeId}.txt`)), "Deleted non-Markdown file remained visible", { visibleAfterDelete, attachment });

  return {
    ok: true,
    vaultName,
    pluginLoaded: Boolean(plugin),
    commandRegistered: commandIds.includes(openCommandId),
    viewOpen: app.workspace.getLeavesOfType(config.viewType).length > 0,
    refreshClicked: true,
    fixture: { folder, original, renamed, attachment },
    visibleRows: {
      afterCreate: visibleAfterCreate.slice(0, 12),
      afterRename: visibleAfterRename.slice(0, 12),
      afterModify: visibleAfterModify.slice(0, 12),
      afterDelete: visibleAfterDelete.slice(0, 12),
    },
  };

  function visibleRows() {
    return Array.from(document.querySelectorAll(".newest-files__item")).map((element) => ({
      text: element.textContent?.replace(/\s+/g, " ").trim() ?? "",
      title: element.getAttribute("title") ?? "",
    }));
  }
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function formatFailure(error, host, port) {
  const launchCommand = `powershell.exe -NoProfile -Command 'Start-Process "$env:LOCALAPPDATA\\Programs\\Obsidian\\Obsidian.exe" -ArgumentList "--remote-debugging-port=${port}","obsidian://open?vault=${TEST_VAULT_NAME}"'`;
  return [
    `CDP smoke failed: ${error?.message ?? error}`,
    "",
    `Expected Obsidian CDP at http://${host}:${port}.`,
    "If Obsidian was already running without CDP, close it first and launch the test vault with:",
    launchCommand,
  ].join("\n");
}

function printHelp() {
  console.log(`Usage: npm run smoke:cdp -- [--port 9222] [--host 127.0.0.1] [--screenshot /tmp/newest-files-smoke.png]\n\nRuns a Chrome DevTools Protocol smoke test against Obsidian's Electron renderer.\nThe open vault must be ${TEST_VAULT_NAME}. The script verifies: vault open, plugin loaded, command registered, view opened, refresh clicked, files visible, and rename/delete/modify event flow.\n`);
}

class CdpClient {
  static connect(url) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const client = new CdpClient(socket);
      socket.addEventListener("open", () => resolve(client), { once: true });
      socket.addEventListener("error", (event) => reject(new Error(event.message ?? "WebSocket connection failed")), {
        once: true,
      });
    });
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.socket.addEventListener("message", (event) => this.onMessage(event));
    this.socket.addEventListener("close", () => {
      for (const { reject } of this.pending.values()) reject(new Error("CDP socket closed"));
      this.pending.clear();
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(payload);
    });
  }

  close() {
    this.socket.close();
  }

  onMessage(event) {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(`${message.error.message}: ${message.error.data ?? ""}`.trim()));
    } else {
      pending.resolve(message.result);
    }
  }
}

await main();
