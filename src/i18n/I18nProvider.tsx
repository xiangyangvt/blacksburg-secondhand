'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { messages, type Locale, type MessageKey } from './messages';

const STORAGE_KEY = 'hb_locale';

type Vars = Record<string, string | number>;

type Ctx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, vars?: Vars) => string;
};

const I18nCtx = createContext<Ctx | null>(null);

function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'zh';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {}
  // 浏览器语言里有 zh 优先中文
  if (navigator.language?.toLowerCase().startsWith('zh')) return 'zh';
  return 'zh'; // 服务面向华人社区，默认中文
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // SSR 上一律 'zh'，hydrate 后从 localStorage 读取
  const [locale, setLocaleState] = useState<Locale>('zh');

  useEffect(() => {
    const init = detectInitialLocale();
    setLocaleState(init);
    document.documentElement.lang = init === 'zh' ? 'zh-CN' : 'en';
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { window.localStorage.setItem(STORAGE_KEY, l); } catch {}
    document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
  }, []);

  const t = useCallback((key: MessageKey, vars?: Vars): string => {
    const tpl: string = messages[key]?.[locale] ?? messages[key]?.zh ?? key;
    if (!vars) return tpl;
    let out: string = tpl;
    for (const k in vars) out = out.split(`{${k}}`).join(String(vars[k]));
    return out;
  }, [locale]);

  return (
    <I18nCtx.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nCtx.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nCtx);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

export function useT() {
  return useI18n().t;
}

export function useLocale() {
  return useI18n().locale;
}
