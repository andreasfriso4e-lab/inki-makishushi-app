import { execSync } from "node:child_process";

function resolveGitSha() {
  if (process.env.NEXT_PUBLIC_APP_VERSION?.trim()) {
    return process.env.NEXT_PUBLIC_APP_VERSION.trim();
  }

  if (process.env.VERCEL_GIT_COMMIT_SHA?.trim()) {
    return process.env.VERCEL_GIT_COMMIT_SHA.trim();
  }

  try {
    return execSync("git rev-parse HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "dev-local";
  }
}

const appVersion = resolveGitSha();
const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME?.trim() || new Date().toISOString();
const appEnvironment =
  process.env.NEXT_PUBLIC_APP_ENVIRONMENT?.trim() ||
  process.env.VERCEL_ENV?.trim() ||
  process.env.NODE_ENV ||
  "development";

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
    NEXT_PUBLIC_APP_ENVIRONMENT: appEnvironment,
  },
};

export default nextConfig;
