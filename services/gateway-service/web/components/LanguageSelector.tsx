import type { Locale } from '../i18n';
import { CustomDropdown } from './CustomDropdown';

export function LanguageSelector({
  locale,
  label,
  onChange,
}: {
  locale: Locale;
  label: string;
  onChange: (locale: Locale) => void;
}) {
  return (
    <>
      <label className="field-label" htmlFor="locale">
        {label}
      </label>
      <CustomDropdown
        id="locale"
        value={locale}
        ariaLabel={label}
        options={[
          { value: 'en', label: 'English', badge: 'EN' },
          { value: 'tr', label: 'Türkçe', badge: 'TR' },
        ]}
        onChange={(next) => onChange(next as Locale)}
      />
    </>
  );
}
