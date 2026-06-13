import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const versions = JSON.parse(fs.readFileSync("versions.json", "utf8"));

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
  [typeof manifest.description === "string" && manifest.description.length > 0 && !manifest.description.toLowerCase().startsWith("this is a plugin"), "description"],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log("Obsidian community submission checks passed.");
