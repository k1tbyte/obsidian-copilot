/**
 * apply-patches.mjs
 *
 * Idempotently re-applies the fork's minimal source modifications after an
 * upstream sync that may have overwritten esbuild.config.mjs / package.json.
 *
 * Run manually or from the sync-upstream CI workflow:
 *   node scripts/apply-patches.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

function write(rel, content) {
  writeFileSync(resolve(ROOT, rel), content);
}

// ---------------------------------------------------------------------------
// Patch 1: esbuild.config.mjs — inject the plus-utils shim plugin
// ---------------------------------------------------------------------------

const SHIM_MARKER = "plus-utils-shim";

const SHIM_IMPORTS = `import path from "path";
import { fileURLToPath } from "url";`;

const SHIM_PLUGIN = `
// ---------------------------------------------------------------------------
// Shim plugin — redirects all @/plusUtils imports to patches/plusUtils.shim.ts
// so Plus checks are bypassed without modifying any upstream source files.
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const plusUtilsShimPlugin = {
  name: "plus-utils-shim",
  setup(build) {
    build.onResolve({ filter: /[/\\\\]plusUtils$/ }, () => ({
      path: path.resolve(__dirname, "patches/plusUtils.shim.ts"),
    }));
  },
};
`;

function patchEsbuildConfig() {
  let src = read("esbuild.config.mjs");

  if (src.includes(SHIM_MARKER)) {
    console.log("  esbuild.config.mjs — already patched, skipping");
    return;
  }

  // 1. Inject path/fileURLToPath imports after the last "import ... from" line
  //    before the first non-import statement.
  if (!src.includes('import path from "path"')) {
    src = src.replace(
      // Match the last import line in the opening block
      /(import nodeModuleShim from [^\n]+\n)/,
      `$1${SHIM_IMPORTS}\n`
    );
  }

  // 2. Insert the plugin definition block before "const banner"
  src = src.replace(/(const banner\s*=\s*`)/, SHIM_PLUGIN + "\n$1");

  // 3. Prepend the plugin to the plugins array
  src = src.replace(/plugins:\s*\[(?!plusUtilsShimPlugin)/, "plugins: [plusUtilsShimPlugin, ");

  write("esbuild.config.mjs", src);
  console.log("  esbuild.config.mjs — patched ✓");
}

// ---------------------------------------------------------------------------
// Patch 2: package.json — decouple tsc from build, add helper scripts
// ---------------------------------------------------------------------------

function patchPackageJson() {
  const pkg = JSON.parse(read("package.json"));
  let changed = false;

  // Remove the blocking `tsc -noEmit` gate from the build step.
  // esbuild does its own transpilation; tsc type-errors are pre-existing in
  // the upstream repo and should not block the fork's release builds.
  if (pkg.scripts?.["build:esbuild"]?.includes("tsc -noEmit")) {
    pkg.scripts["build:esbuild"] = "node esbuild.config.mjs production";
    changed = true;
  }

  // Preserve tsc as an explicit opt-in check.
  if (!pkg.scripts?.["typecheck"]) {
    pkg.scripts["typecheck"] = "tsc -noEmit -skipLibCheck";
    changed = true;
  }

  // Local vault watcher script.
  if (!pkg.scripts?.["watch:vault"]) {
    pkg.scripts["watch:vault"] = "node scripts/watch-vault.mjs";
    changed = true;
  }

  if (changed) {
    write("package.json", JSON.stringify(pkg, null, 2) + "\n");
    console.log("  package.json — patched ✓");
  } else {
    console.log("  package.json — already patched, skipping");
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log("Applying fork patches...");
patchEsbuildConfig();
patchPackageJson();
console.log("Done.");
