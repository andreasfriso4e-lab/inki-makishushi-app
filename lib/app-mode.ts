export type AppDeviceMode = "cassa" | "palmare";

export const APP_MODE_QUERY_PARAM = "mode";
export const PALMARE_MODE_VALUE: AppDeviceMode = "palmare";
export const CASSA_MODE_VALUE: AppDeviceMode = "cassa";

export function resolveAppDeviceMode(params?: {
  mode?: string;
  device?: string;
}): AppDeviceMode {
  return params?.mode === PALMARE_MODE_VALUE || params?.device === PALMARE_MODE_VALUE
    ? PALMARE_MODE_VALUE
    : CASSA_MODE_VALUE;
}

export function getAppHomePath(mode: AppDeviceMode) {
  return mode === PALMARE_MODE_VALUE ? "/palmare" : "/cassa";
}

export function getAppModeLabel(mode: AppDeviceMode) {
  return mode === PALMARE_MODE_VALUE ? "Modalita palmare" : "Modalita cassa";
}

export function buildOrderRoute(
  tableId: string,
  panelMode: string,
  mode: AppDeviceMode = CASSA_MODE_VALUE
) {
  const url = new URLSearchParams({ panelMode });

  if (mode === PALMARE_MODE_VALUE) {
    url.set(APP_MODE_QUERY_PARAM, PALMARE_MODE_VALUE);
  }

  return `/order/${tableId}?${url.toString()}`;
}
