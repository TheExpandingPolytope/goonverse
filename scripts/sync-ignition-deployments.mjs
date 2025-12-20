import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();

const SOURCE = path.join(
  repoRoot,
  "packages",
  "contract",
  "ignition",
  "deployments"
);

const TARGETS = [
  path.join(repoRoot, "packages", "server", "contract", "ignition", "deployments"),
  path.join(repoRoot, "packages", "indexer", "contract", "ignition", "deployments"),
  path.join(repoRoot, "packages", "client", "contract", "ignition", "deployments"),
];

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function listChainDirs(sourceDir) {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && e.name.startsWith("chain-"))
    .map((e) => e.name);
}

async function copyFile(src, dst) {
  await ensureDir(path.dirname(dst));
  await fs.copyFile(src, dst);
}

async function main() {
  if (!(await pathExists(SOURCE))) {
    console.error(`Source deployments directory not found: ${SOURCE}`);
    process.exit(1);
  }

  const chains = await listChainDirs(SOURCE);
  if (chains.length === 0) {
    console.error(`No chain-* directories found in: ${SOURCE}`);
    process.exit(1);
  }

  for (const targetRoot of TARGETS) {
    await ensureDir(targetRoot);
  }

  let copied = 0;

  for (const chainDir of chains) {
    const src = path.join(SOURCE, chainDir, "deployed_addresses.json");
    if (!(await pathExists(src))) continue;

    for (const targetRoot of TARGETS) {
      const dst = path.join(targetRoot, chainDir, "deployed_addresses.json");
      await copyFile(src, dst);
      copied += 1;
    }
  }

  console.log(
    `Synced ignition deployed_addresses.json for ${chains.length} chain(s) to ${TARGETS.length} package(s). Files copied: ${copied}`
  );
}

await main();


