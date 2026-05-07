"use client";

import { useEffect, useMemo, useState } from "react";

import { getAppVersion } from "@/lib/app-version";

const VERSION_CHECK_INTERVAL_MS = 60_000;
const ACTIVE_DRAFT_STORAGE_PREFIX = "inki:active-order-draft:";

type VersionPayload = {
  appVersion: string;
  buildTime: string;
  environment: string;
};

function hasProtectedDraftInBrowser() {
  if (typeof window === "undefined") {
    return false;
  }

  return Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index)).some(
    (key) => typeof key === "string" && key.startsWith(ACTIVE_DRAFT_STORAGE_PREFIX)
  );
}

export function AppVersionMonitor() {
  const clientVersion = useMemo(() => getAppVersion(), []);
  const [serverVersion, setServerVersion] = useState<VersionPayload | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [hasProtectedDraft, setHasProtectedDraft] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const refreshVersion = async () => {
      try {
        const response = await fetch("/api/version", {
          method: "GET",
          cache: "no-store",
          headers: {
            "Cache-Control": "no-store",
          },
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as VersionPayload;

        if (!isMounted) {
          return;
        }

        setServerVersion(payload);
        setHasProtectedDraft(hasProtectedDraftInBrowser());
      } catch {
        // silent: banner is only informative
      }
    };

    void refreshVersion();
    const intervalId = window.setInterval(() => {
      void refreshVersion();
    }, VERSION_CHECK_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const showUpdateBanner =
    serverVersion &&
    serverVersion.appVersion !== clientVersion &&
    dismissedVersion !== serverVersion.appVersion;

  if (!showUpdateBanner) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 top-0 z-[80] flex justify-center px-3 pt-3">
      <div className="flex w-full max-w-4xl items-start gap-3 rounded-[10px] border border-[#a9c9e6] bg-[#ecf6ff] px-4 py-3 shadow-[0_10px_30px_rgba(11,60,93,0.12)]">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-[#0b3c5d]">Nuova versione disponibile</div>
          <div className="mt-1 text-sm text-[#244b66]">
            {hasProtectedDraft
              ? "È stata rilevata una nuova build. La bozza locale è protetta: puoi aggiornare in sicurezza."
              : "È stata rilevata una nuova build. Aggiorna per usare la versione appena deployata."}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setDismissedVersion(serverVersion.appVersion)}
            className="h-10 rounded-[6px] border border-[#b8d3e9] bg-white px-3 text-sm font-semibold text-[#2e2a25]"
          >
            Più tardi
          </button>
          <button
            type="button"
            onClick={() => {
              setHasProtectedDraft(hasProtectedDraftInBrowser());
              window.location.reload();
            }}
            className="h-10 rounded-[6px] border border-[#8db5d4] bg-[#cfe8ff] px-4 text-sm font-semibold text-[#0b3c5d]"
          >
            Aggiorna
          </button>
        </div>
      </div>
    </div>
  );
}
