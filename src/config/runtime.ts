export interface RuntimeEnvironment {
  DEV?: boolean;
  VITE_PUBLIC_API_BASE_URL?: string;
  VITE_APP_VERSION?: string;
  VITE_APP_ENV?: string;
  VITE_USE_DEV_MOCK?: string;
}

export interface RuntimeSettings {
  apiBaseUrl: string;
  appVersion: string;
  environment: "DEV" | "UAT" | "PRODUCTION";
  useDevMock: boolean;
}

const normalizeEnvironment = (value?: string): RuntimeSettings["environment"] => {
  if (value === "UAT" || value === "PRODUCTION") {
    return value;
  }

  return "DEV";
};

const normalizeBoolean = (value?: string): boolean | undefined => {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
};

export const createRuntimeSettings = (
  environment: RuntimeEnvironment,
): RuntimeSettings => {
  const appEnvironment = normalizeEnvironment(environment.VITE_APP_ENV);
  const configuredMock = normalizeBoolean(environment.VITE_USE_DEV_MOCK);
  const useDevMock =
    appEnvironment === "DEV" &&
    (configuredMock ?? Boolean(environment.DEV));
  const configuredApiBaseUrl = environment.VITE_PUBLIC_API_BASE_URL?.trim().replace(/\/$/, "") ?? "";

  return {
    // In a local ZMP session, the runnable Mini App is hosted in an iframe on
    // a different port from the outer frame. Route real public API calls via
    // Vite's DEV proxy; the deployed build retains the configured origin.
    apiBaseUrl: environment.DEV && !useDevMock && configuredApiBaseUrl ? "" : configuredApiBaseUrl,
    appVersion: environment.VITE_APP_VERSION?.trim() || "0.0.0-dev",
    environment: appEnvironment,
    useDevMock,
  };
};

export const runtimeSettings = createRuntimeSettings(import.meta.env);
