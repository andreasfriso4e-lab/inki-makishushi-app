#!/usr/bin/env node

import { execSync } from "node:child_process";

function run(command) {
  return execSync(command, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function normalizeProductionUrl() {
  const candidate =
    process.env.PRODUCTION_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    "";

  if (!candidate) {
    throw new Error(
      "PRODUCTION_URL non configurato. Imposta PRODUCTION_URL=https://tuo-dominio-vercel prima di eseguire verify-production."
    );
  }

  return /^https?:\/\//i.test(candidate) ? candidate.replace(/\/+$/, "") : `https://${candidate.replace(/\/+$/, "")}`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Cache-Control": "no-store",
    },
  });

  return {
    ok: response.ok,
    status: response.status,
    body: await response.json().catch(() => null),
  };
}

async function fetchStatus(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Cache-Control": "no-store",
    },
  });

  return {
    ok: response.ok,
    status: response.status,
  };
}

async function main() {
  const issues = [];
  const localStatus = run("git status --porcelain");
  const localHead = run("git rev-parse HEAD");
  const remoteHead = run("git ls-remote origin refs/heads/main").split(/\s+/)[0] ?? "";
  const productionUrl = normalizeProductionUrl();

  if (localStatus) {
    issues.push("ATTENZIONE: ci sono modifiche locali non committate.");
  }

  if (remoteHead && localHead !== remoteHead) {
    issues.push("ATTENZIONE: origin/main non contiene ancora il commit locale corrente.");
  }

  const [versionCheck, healthCheck, cassaCheck, palmareCheck] = await Promise.all([
    fetchJson(`${productionUrl}/api/version`),
    fetchJson(`${productionUrl}/api/health`),
    fetchStatus(`${productionUrl}/cassa`),
    fetchStatus(`${productionUrl}/palmare`),
  ]);

  if (!versionCheck.ok || !versionCheck.body?.appVersion) {
    issues.push("ATTENZIONE: /api/version non risponde correttamente in produzione.");
  } else if (remoteHead && versionCheck.body.appVersion !== remoteHead) {
    issues.push(
      `ATTENZIONE: produzione non aggiornata. Versione produzione=${versionCheck.body.appVersion}, origin/main=${remoteHead}.`
    );
  }

  if (!healthCheck.ok || healthCheck.body?.ok !== true) {
    issues.push("ATTENZIONE: /api/health non è ok in produzione.");
  }

  if (!cassaCheck.ok) {
    issues.push(`ATTENZIONE: /cassa non risponde correttamente (status ${cassaCheck.status}).`);
  }

  if (!palmareCheck.ok) {
    issues.push(`ATTENZIONE: /palmare non risponde correttamente (status ${palmareCheck.status}).`);
  }

  console.log("verify-production");
  console.log({
    productionUrl,
    localHead,
    remoteHead,
    productionVersion: versionCheck.body?.appVersion ?? null,
    productionEnvironment: versionCheck.body?.environment ?? null,
    healthOk: healthCheck.body?.ok ?? false,
    cassaStatus: cassaCheck.status,
    palmareStatus: palmareCheck.status,
    hasUncommittedChanges: Boolean(localStatus),
  });

  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(issue);
    }
    console.error(
      "ATTENZIONE: produzione non aggiornata, non testare su Vercel finché non fai commit/push/deploy."
    );
    process.exit(1);
  }

  console.log("Produzione aggiornata e verificata.");
}

void main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "verify-production fallito con errore inatteso"
  );
  process.exit(1);
});
