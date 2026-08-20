import { ES_TRANSLATIONS } from './translations/es'
import { PT_TRANSLATIONS } from './translations/pt'

export const SUPPORTED_LANGUAGES = ['en', 'pt', 'es']
export const DEFAULT_LANGUAGE = 'en'
export const LANGUAGE_STORAGE_KEY = 'market-cycle-trader-language'

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {},
  pt: PT_TRANSLATIONS,
  es: ES_TRANSLATIONS,
}

const INTL_LOCALES: Record<string, string> = {
  en: 'en-US',
  pt: 'pt-BR',
  es: 'es-ES',
}

let currentLanguage = DEFAULT_LANGUAGE

export function normalizeLanguage(value: any) {
  const normalized = String(value || '').trim().toLowerCase().split('-')[0]
  return SUPPORTED_LANGUAGES.includes(normalized) ? normalized : DEFAULT_LANGUAGE
}

export function setCurrentLanguage(language: string) {
  currentLanguage = normalizeLanguage(language)
}

export function getCurrentLanguage() {
  return currentLanguage
}

export function getIntlLocale(language: string = currentLanguage) {
  return INTL_LOCALES[normalizeLanguage(language)] || INTL_LOCALES.en
}

function interpolate(message: string, values: AppRecord = {}) {
  if (!values) return message
  return String(message).replace(/\{([\w]+)\}/g, (match: any, key: string) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ))
}

export function tr(message: any, values: AppRecord = {}) {
  if (message === null || message === undefined) return ''
  const source = String(message)
  const translated = TRANSLATIONS[currentLanguage]?.[source] || source
  return interpolate(translated, values)
}

export function translatedStatus(value: any) {
  const source = String(value || 'unknown').replaceAll('_', ' ')
  return tr(source.replace(/\b\w/g, (letter: any) => letter.toUpperCase()))
}
