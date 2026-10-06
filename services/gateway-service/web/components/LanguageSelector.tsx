import type { Locale } from '../i18n';

export function LanguageSelector({ locale, label, onChange }: { locale: Locale; label: string; onChange: (locale: Locale) => void }) {
  return <><label className="field-label" htmlFor="locale">{label}</label><select id="locale" className="input" value={locale} onChange={(event) => onChange(event.target.value as Locale)}><option value="en">English</option><option value="tr">Türkçe</option></select></>;
}
