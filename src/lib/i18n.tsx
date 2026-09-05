import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import en from './messages/en';
import es from './messages/es';
import fr from './messages/fr';
import de from './messages/de';
import pt from './messages/pt';
import hi from './messages/hi';
import ja from './messages/ja';
import zh from './messages/zh';
import ar from './messages/ar';
import type { MsgKey } from './messages/types';

export type Lang = 'en' | 'es' | 'fr' | 'de' | 'pt' | 'hi' | 'ja' | 'zh' | 'ar';

export const LANGS: { code: Lang; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'es', label: 'Spanish', native: 'Español' },
  { code: 'fr', label: 'French', native: 'Français' },
  { code: 'de', label: 'German', native: 'Deutsch' },
  { code: 'pt', label: 'Portuguese', native: 'Português' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'ja', label: 'Japanese', native: '日本語' },
  { code: 'zh', label: 'Chinese', native: '中文' },
  { code: 'ar', label: 'Arabic', native: 'العربية' },
];

const DICTS: Record<Lang, Record<MsgKey, string>> = { en, es, fr, de, pt, hi, ja, zh, ar };
const LANG_STORE = 'sharetext.locale';

function normalize(code: string): Lang | null {
  const base = code.toLowerCase().replace('_', '-').split('-')[0];
  if (base.startsWith('zh')) return 'zh';
  if (base === 'pt') return 'pt';
  const known: Lang[] = ['en', 'es', 'fr', 'de', 'hi', 'ja', 'ar'];
  return (known as string[]).includes(base) ? (base as Lang) : null;
}

/** First-match against the browser's language list; falls back to en. */
function detectLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = localStorage.getItem(LANG_STORE);
    if (saved) {
      const n = normalize(saved);
      if (n) return n;
    }
  } catch { /* private mode */ }
  const candidates =
    typeof navigator !== 'undefined'
      ? (navigator.languages && navigator.languages.length > 0 ? navigator.languages : [navigator.language])
      : [];
  for (const c of candidates) {
    const n = c ? normalize(c) : null;
    if (n) return n;
  }
  return 'en';
}

export interface I18nApi {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  /** Translate key → active locale, English fallback, then the key itself. */
  t: (key: MsgKey, params?: Record<string, string | number>) => string;
  setLang: (l: Lang) => void;
}

const I18nContext = createContext<I18nApi | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  // Keep <html lang/dir> in sync with the active locale — assistive tech,
  // RTL layout and any :lang() CSS all read it from here.
  useEffect(() => {
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    const el = document.documentElement;
    el.lang = lang === 'zh' ? 'zh-Hans' : lang;
    if (el.dir !== dir) el.dir = dir;
    try { localStorage.setItem(LANG_STORE, lang); } catch { /* private mode */ }
  }, [lang]);

  const api = useMemo<I18nApi>(() => {
    const t: I18nApi['t'] = (key, params) => {
      let s = DICTS[lang]?.[key] ?? en[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return s;
    };
    return { lang, dir: lang === 'ar' ? 'rtl' : 'ltr', t, setLang: setLangState };
  }, [lang]);

  return <I18nContext.Provider value={api}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nApi {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Tolerate usage outside the provider (error boundaries etc.) with an
    // English passthrough — never crash rendering over a missing provider.
    return {
      lang: 'en',
      dir: 'ltr',
      t: (key, params) => {
        let s = en[key] ?? key;
        if (params) for (const [k, v] of Object.entries(params)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        return s;
      },
      setLang: () => {},
    };
  }
  return ctx;
}
