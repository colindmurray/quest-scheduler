const DEFAULT_APP_URL = "https://questscheduler.cc";
const DEFAULT_SUPPORT_EMAIL = "support@questscheduler.cc";
const DEFAULT_APP_NAME = "Quest Scheduler";
const DEFAULT_GOOGLE_OAUTH_CLIENT_ID = "";

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

export const APP_NAME =
  import.meta.env.VITE_APP_NAME || DEFAULT_APP_NAME;

export const SUPPORT_EMAIL =
  import.meta.env.VITE_SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL;

export const APP_URL = (() => {
  const envUrl = import.meta.env.VITE_APP_URL;
  if (envUrl) {
    return trimTrailingSlash(envUrl);
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return trimTrailingSlash(window.location.origin);
  }
  return DEFAULT_APP_URL;
})();

export const APP_LOGO_URL = `${APP_URL}/app_icon.png`;

export const GOOGLE_OAUTH_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || DEFAULT_GOOGLE_OAUTH_CLIENT_ID;
