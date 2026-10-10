import { spawnSync } from "node:child_process";

const isPreview = process.env.VERCEL_ENV === "preview";
const migratePreview = process.env.APPLY_PRISMA_MIGRATIONS === "true";
const shouldMigrate = !isPreview || migratePreview;
const runner = process.platform === "win32" ? "npx.cmd" : "npx";

function run(args) {
  const result = spawnSync(runner, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (shouldMigrate) {
  console.log("Applying PostgreSQL migrations...");
  run(["prisma", "migrate", "deploy"]);
} else {
  console.log("Preview build: skipping database migrations. Set APPLY_PRISMA_MIGRATIONS=true only with a separate preview database.");
}

run(["next", "build", "--webpack"]);
