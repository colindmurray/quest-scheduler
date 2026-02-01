const { spawnSync } = require("node:child_process");

const mode = process.env.VITE_BUILD_MODE || "production";
const minify = process.env.VITE_BUILD_MINIFY ?? "false";
const sourcemap = process.env.VITE_BUILD_SOURCEMAP ?? "true";

const args = ["--prefix", "web", "run", "build", "--", "--mode", mode];

if (minify === "false") {
  args.push("--minify", "false");
}

if (sourcemap === "true") {
  args.push("--sourcemap");
}

const result = spawnSync("npm", args, { stdio: "inherit" });

process.exit(result.status ?? 1);
