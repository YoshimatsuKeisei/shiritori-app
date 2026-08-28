export const DEFAULT_BROWSER_DICTIONARY_BASE_URL = "/dictionary";

export function resolveBrowserDictionaryBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim().replace(/\/+$/, "");
  return trimmed || DEFAULT_BROWSER_DICTIONARY_BASE_URL;
}

export function getConfiguredBrowserDictionaryBaseUrl(): string {
  return resolveBrowserDictionaryBaseUrl(import.meta.env.VITE_DICTIONARY_BASE_URL);
}
