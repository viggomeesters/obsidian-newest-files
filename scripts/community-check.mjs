import fs from "node:fs";
import https from "node:https";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const versions = JSON.parse(fs.readFileSync("versions.json", "utf8"));
const source = fs.readFileSync("src/main.ts", "utf8");

const expectedRepo = "https://github.com/viggomeesters/obsidian-newest-files";
const allowedManifestNamePattern = /^[A-Za-z0-9 ()+-]+$/;
const lowerName = manifest.name.toLowerCase();
const lowerDescription = manifest.description.toLowerCase();
const directHeadingElementPattern = /\.createEl\(\s*["']h[1-6]["']/;
const pluginNameHeadingPattern = new RegExp(
  `\\.setName\\(\\s*['\"]${escapeRegExp(manifest.name)}['\"]\\s*\\)\\.setHeading\\(`,
);

const checks = [
  [fs.existsSync("README.md"), "README"],
  [fs.existsSync("LICENSE"), "LICENSE"],
  [fs.existsSync("main.js"), "main.js"],
  [fs.existsSync("styles.css"), "styles.css"],
  [fs.existsSync("CHANGELOG.md"), "changelog"],
  [fs.existsSync("SECURITY.md"), "security"],
  [fs.existsSync("CONTRIBUTING.md"), "contributing"],
  [fs.existsSync(".github/workflows/release.yml"), "release workflow"],
  [manifest.id === "newest-files", "id"],
  [manifest.name === "Newest Files", "name"],
  [manifest.version === pkg.version, "version match"],
  [typeof manifest.minAppVersion === "string" && manifest.minAppVersion.length > 0, "min app version"],
  [versions[manifest.version] === manifest.minAppVersion, "versions mapping"],
  [/^[a-z-]+$/.test(manifest.id), "id format"],
  [!manifest.id.includes("obsidian"), "id avoids obsidian"],
  [!manifest.id.endsWith("plugin"), "id avoids plugin suffix"],
  [allowedManifestNamePattern.test(manifest.name), "name uses allowed punctuation"],
  [!lowerName.includes("obsidian") && !lowerName.includes("obsi-") && !lowerName.includes("-sidian"), "name avoids obsidian"],
  [typeof manifest.description === "string" && manifest.description.length > 0 && !lowerDescription.startsWith("this is a plugin"), "description"],
  [!lowerDescription.includes("obsidian"), "description avoids obsidian"],
  [!source.includes("detachLeavesOfType"), "does not detach leaves in onunload"],
  [!source.includes("revealLeaf("), "does not use revealLeaf with current minAppVersion"],
  [!directHeadingElementPattern.test(source), "settings headings use Setting.setHeading instead of direct h1-h6 elements"],
  [!pluginNameHeadingPattern.test(source), "settings headings avoid the plugin name"],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
failures.push(...await checkCommunityDirectory());

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log("Obsidian community submission checks passed.");

async function checkCommunityDirectory() {
  if (process.env.SKIP_LIVE_COMMUNITY_CHECK === "1") return [];

  const failures = [];
  const plugins = await fetchJson("https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json");
  const rawIdMatch = plugins.find((plugin) => plugin.id === manifest.id);
  const rawNameMatch = plugins.find((plugin) => plugin.name?.toLowerCase() === lowerName);

  if (rawIdMatch && rawIdMatch.repo !== expectedRepo) {
    failures.push(`community directory already has id ${manifest.id}`);
  }
  if (rawNameMatch && rawNameMatch.repo !== expectedRepo) {
    failures.push(`community directory already has name ${manifest.name}`);
  }

  const html = await fetchText(`https://community.obsidian.md/plugins/${manifest.id}`);
  const isNotFound = html.includes("<title>Plugin not found</title>");
  if (!isNotFound && !html.includes(expectedRepo)) {
    failures.push(`live community slug ${manifest.id} is already taken by another plugin`);
  }

  return failures;
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve(body));
    }).on("error", reject);
  });
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
