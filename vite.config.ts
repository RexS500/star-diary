import vinext from "vinext";
import { defineConfig } from "vite";
import { execFileSync } from "node:child_process";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const { d1, r2 } = hostingConfig;

const gitValue = (args: string[], fallback: string) => {
  try { return execFileSync("git", args, { encoding: "utf8" }).trim() || fallback; }
  catch { return fallback; }
};
const commitCount = Number(gitValue(["rev-list", "--count", "HEAD"], "0"));
const commitSha = gitValue(["rev-parse", "--short=12", "HEAD"], "local");
const appVersion = process.env.APP_VERSION || `1.0.${Math.max(0, commitCount)}`;
const appBuildId = process.env.APP_BUILD_ID || `${appVersion}-${commitSha}`;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "star-diary-db",
          database_id: "23603ab4-8a8a-4c74-b463-48f08bb13739",
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __APP_BUILD_ID__: JSON.stringify(appBuildId),
    },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
