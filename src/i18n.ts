import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_LOCALE = 'en';
const SUPPORTED_LOCALES = ['en', 'fr'];

/**
 * Returns the locale to use (e.g. "fr", "en"). Uses base language only.
 */
export function getLocale(): string {
  try {
    const lang = typeof process.env.VSCODE_NLS_CONFIG === 'string'
      ? (JSON.parse(process.env.VSCODE_NLS_CONFIG) as { locale: string }).locale
      : undefined;
    if (lang) {
      const base = lang.split('-')[0];
      return SUPPORTED_LOCALES.includes(base) ? base : DEFAULT_LOCALE;
    }
  } catch {
    // ignore
  }
  return DEFAULT_LOCALE;
}

/**
 * Loads webview messages for the current or given locale.
 * Call from extension code; __dirname will be dist/ so we resolve l10n from extension root.
 */
export function getWebviewMessages(locale?: string): Record<string, string> {
  const base = locale ?? getLocale();
  const resolved = SUPPORTED_LOCALES.includes(base) ? base : DEFAULT_LOCALE;
  const baseDir = path.join(__dirname, '..', 'l10n');
  const filePath = path.join(baseDir, `messages-${resolved}.json`);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    if (resolved !== DEFAULT_LOCALE) {
      return getWebviewMessages(DEFAULT_LOCALE);
    }
    return {};
  }
}
