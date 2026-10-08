"use client";

import { createContext, useContext } from "react";

import type { Locale } from "../types";
import type { Dictionary } from "./en";
import { getDictionary } from "./index";

const I18nContext = createContext<{ locale: Locale; dict: Dictionary }>({
  locale: "en",
  dict: getDictionary("en"),
});

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <I18nContext.Provider value={{ locale, dict: getDictionary(locale) }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
