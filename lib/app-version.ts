export function getAppVersion() {
  return process.env.NEXT_PUBLIC_APP_VERSION?.trim() || "dev-local";
}

export function getAppBuildTime() {
  return process.env.NEXT_PUBLIC_BUILD_TIME?.trim() || "unknown";
}

export function getAppEnvironment() {
  return process.env.NEXT_PUBLIC_APP_ENVIRONMENT?.trim() || process.env.NODE_ENV || "development";
}

export function getBuildMetadata() {
  return {
    appVersion: getAppVersion(),
    buildTime: getAppBuildTime(),
    environment: getAppEnvironment(),
  };
}
