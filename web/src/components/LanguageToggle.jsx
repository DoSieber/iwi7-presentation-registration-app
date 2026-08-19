import { LANGUAGES } from '../i18n';

export function LanguageToggle({ lang, onChange, label }) {
  return (
    <div className="lang" role="group" aria-label={label}>
      {LANGUAGES.map((code) => (
        <button
          key={code}
          type="button"
          className={code === lang ? 'lang-btn is-active' : 'lang-btn'}
          aria-pressed={code === lang}
          onClick={() => onChange(code)}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
