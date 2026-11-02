import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const historyDir = path.join(root, "docs", "development-history");
const statePath = path.join(historyDir, ".history-state.json");
const pendingPath = path.join(historyDir, "PENDING_UPDATE.md");
const changelogPath = path.join(historyDir, "CHANGELOG.md");
const registryPath = path.join(historyDir, "FEATURE_REGISTRY.md");
const ignoredDirectories = new Set([".git", "node_modules", "dist", "tmp"]);
const ignoredFiles = new Set([".env", ".history-state.json", "PENDING_UPDATE.md"]);
const changeTypes = new Set(["Added", "Modified", "Removed", "Fixed", "Refactored", "Security", "Documentation", "Infrastructure"]);

function walk(directory, relative = "") {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) files.push(...walk(path.join(directory, entry.name), relativePath));
      continue;
    }
    if (ignoredFiles.has(entry.name) || entry.name.endsWith(".log")) continue;
    const absolutePath = path.join(directory, entry.name);
    const hash = crypto.createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex");
    files.push({ path: relativePath.split(path.sep).join("/"), hash, bytes: fs.statSync(absolutePath).size });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function readState() {
  try { return JSON.parse(fs.readFileSync(statePath, "utf8")); } catch { return null; }
}

function git(args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function gitEvidence() {
  const commit = git(["rev-parse", "HEAD"]);
  return {
    available: Boolean(git(["rev-parse", "--is-inside-work-tree"])),
    commit: commit || "unavailable",
    status: git(["status", "--short"]) || "clean or unavailable"
  };
}

function parseArgs(argv) {
  const args = { record: false, title: "Unclassified file changes", type: "Modified", description: "", reason: "", features: "Requires review", followUp: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--record") args.record = true;
    else if (value.startsWith("--") && index + 1 < argv.length) {
      const key = value.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
      if (key in args) args[key] = argv[++index];
    }
  }
  if (!changeTypes.has(args.type)) throw new Error(`Unsupported --type ${args.type}. Use: ${[...changeTypes].join(", ")}`);
  return args;
}

function changesSince(previousFiles, currentFiles) {
  const before = new Map((previousFiles || []).map((file) => [file.path, file]));
  const after = new Map(currentFiles.map((file) => [file.path, file]));
  const added = [], modified = [], removed = [];
  for (const file of currentFiles) {
    if (!before.has(file.path)) added.push(file.path);
    else if (before.get(file.path).hash !== file.hash) modified.push(file.path);
  }
  for (const file of previousFiles || []) if (!after.has(file.path)) removed.push(file.path);
  return { added, modified, removed };
}

function list(items) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- None";
}

function nextChangeId(date) {
  const base = `CHANGE-${date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`;
  const text = fs.readFileSync(changelogPath, "utf8");
  if (!text.includes(`## ${base}`)) return base;
  let suffix = 2;
  while (text.includes(`## ${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function writePending({ date, changes, gitInfo, hasPreviousScan, changeId }) {
  const all = [...changes.added, ...changes.modified, ...changes.removed];
  const contents = `# Pending Development-History Update\n\nGenerated: ${date.toISOString()}\n\nThis is a factual file scan. It does not infer product features, reasons, or removals. Review it before recording semantic changes.\n\n## Scan state\n\n- Previous scan available: ${hasPreviousScan ? "yes" : "no; baseline initialized"}\n- Git repository available: ${gitInfo.available ? "yes" : "no"}\n- Git HEAD: ${gitInfo.commit}\n- Candidate change ID: ${changeId || "none"}\n\n## Added files\n\n${list(changes.added)}\n\n## Modified files\n\n${list(changes.modified)}\n\n## Removed files\n\n${list(changes.removed)}\n\n## Review checklist\n\n- [ ] Confirm which files represent a feature change.\n- [ ] Update \`FEATURE_REGISTRY.md\` for feature additions, modifications, deprecations, or removals.\n- [ ] Update \`ARCHITECTURE_DECISIONS.md\` if a design decision changed.\n- [ ] Update \`REMOVED_FEATURES.md\` if a feature was removed.\n- [ ] Add a snapshot or release note if this is a milestone.\n${all.length ? "" : "\nNo file changes were detected since the previous scan.\n"}`;
  fs.writeFileSync(pendingPath, contents);
}

function appendRecord({ args, date, changeId, changes, gitInfo }) {
  const dependencyFiles = [...changes.added, ...changes.modified, ...changes.removed].filter((file) => file === "package.json" || file === "package-lock.json");
  const entry = `\n## ${changeId} — ${args.title}\n\nDate: ${date.toISOString()}\n\nType: ${args.type}\n\n### Description\n\n${args.description || "Recorded the file-level changes detected since the previous history scan. Review the affected features before relying on this entry as a semantic summary."}\n\n### Reason\n\n${args.reason || "Not supplied; requires review."}\n\n### Features\n\n${args.features || "Requires review; the history script does not infer feature semantics."}\n\n### Files Created\n\n${list(changes.added)}\n\n### Files Modified\n\n${list(changes.modified)}\n\n### Files Removed\n\n${list(changes.removed)}\n\n### Dependencies\n\n${dependencyFiles.length ? `Package manifests changed: ${dependencyFiles.join(", ")}. Inspect the diff for additions or removals.` : "No package manifest changes detected."}\n\n### Git\n\n- Repository available: ${gitInfo.available ? "yes" : "no"}\n- Commit: ${gitInfo.commit}\n\n### Limitations and follow-up\n\n${args.followUp || "Review the generated file list and update the feature registry or removal registry when applicable."}\n`;
  fs.appendFileSync(changelogPath, entry);
  const registry = fs.readFileSync(registryPath, "utf8").replace(/^Last automated scan: .*$/m, `Last automated scan: ${date.toISOString()} — ${changeId}`);
  fs.writeFileSync(registryPath, registry);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = new Date();
  const currentFiles = walk(root);
  const previousState = readState();
  const changes = changesSince(previousState?.files, currentFiles);
  const gitInfo = gitEvidence();
  const hasChanges = changes.added.length || changes.modified.length || changes.removed.length;
  const changeId = args.record && hasChanges ? nextChangeId(date) : "";

  writePending({ date, changes, gitInfo, hasPreviousScan: Boolean(previousState), changeId });
  if (args.record && hasChanges) appendRecord({ args, date, changeId, changes, gitInfo });

  const finalFiles = walk(root);
  fs.writeFileSync(statePath, JSON.stringify({ schemaVersion: 1, scannedAt: date.toISOString(), git: gitInfo, files: finalFiles }, null, 2) + "\n");
  console.log(JSON.stringify({ scannedAt: date.toISOString(), previousScan: Boolean(previousState), changes, git: gitInfo, recorded: Boolean(args.record && hasChanges), changeId: changeId || null, pendingFile: path.relative(root, pendingPath) }, null, 2));
}

main();
