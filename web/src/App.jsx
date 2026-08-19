import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSessions, submitRegistration } from './api';
import { strings, formatDate } from './i18n';
import { useIframeHeight } from './useIframeHeight';
import { LanguageToggle } from './components/LanguageToggle';
import { SessionList } from './components/SessionList';
import { RegistrationForm } from './components/RegistrationForm';

const LANG_KEY = 'iwi7-registration-lang';

function readStoredLang() {
  try {
    const stored = window.localStorage.getItem(LANG_KEY);
    if (stored === 'de' || stored === 'en') return stored;
  } catch {
    // localStorage can be blocked inside a cross-origin iframe. Not fatal.
  }
  return (navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'de';
}

function errorMessage(code, t) {
  switch (code) {
    case 'session_full':
      return t.errSessionFull;
    case 'email_domain':
      return t.errEmailDomain;
    case 'already_registered':
      return t.errAlreadyRegistered;
    case 'invalid_supervisor':
      return t.errInvalidSupervisor;
    case 'try_again':
      return t.errTryAgain;
    case 'deadline_passed':
      return t.errDeadlinePassed;
    case 'rate_limited':
      return t.errRateLimited;
    case 'captcha_failed':
      return t.errCaptcha;
    default:
      return t.errGeneric;
  }
}

export default function App() {
  const [lang, setLang] = useState(readStoredLang);
  const [sessions, setSessions] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [leadDays, setLeadDays] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [confirmed, setConfirmed] = useState(null);

  const t = strings[lang];

  useEffect(() => {
    document.documentElement.lang = t.htmlLang;
    document.title = t.title;
    try {
      window.localStorage.setItem(LANG_KEY, lang);
    } catch {
      // See readStoredLang.
    }
  }, [lang, t]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const data = await fetchSessions();
      setSessions(data.sessions || []);
      setSupervisors(data.supervisors || []);
      setLeadDays(Number.isInteger(data.leadDays) ? data.leadDays : null);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useIframeHeight([loading, loadFailed, sessions, selectedKey, serverError, confirmed, lang]);

  // An afternoon can fill up between two loads, so the selection is derived
  // from the current list rather than kept as an independent copy.
  const selected = useMemo(
    () => sessions.find((s) => s.key === selectedKey) || null,
    [sessions, selectedKey]
  );

  const handleSubmit = async (payload) => {
    setSubmitting(true);
    setServerError('');
    try {
      // The confirmed time comes from the response, not from what was shown
      // before submitting. Those two differ when someone books at the same time.
      const result = await submitRegistration(payload);
      setConfirmed(result.slot);
      setSelectedKey(null);
      load();
    } catch (err) {
      setServerError(errorMessage(err.code, t));
      if (err.code === 'session_full') {
        setSelectedKey(null);
        load();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setConfirmed(null);
    setServerError('');
    load();
  };

  return (
    <main className="app">
      <header className="header">
        <h1>{t.title}</h1>
        <LanguageToggle lang={lang} onChange={setLang} label={t.langLabel} />
      </header>

      {confirmed ? (
        <section className="panel">
          <div className="alert alert-success" role="status">
            <strong>{t.successHeading}</strong>
            <p className="confirmed-slot">
              {t.successIntro}: <strong>{formatDate(confirmed.date, lang)}</strong>
              {confirmed.time ? `, ${confirmed.time}` : ''}
              {confirmed.room ? `, ${t.room} ${confirmed.room}` : ''}
            </p>
            <p className="confirmed-attendance">{t.successAttendance}.</p>
            <p className="confirmed-note">{t.successNote}</p>
          </div>
          <button type="button" className="btn-secondary" onClick={reset}>
            {t.newRegistration}
          </button>
        </section>
      ) : (
        <>
          <p className="intro">
            {t.intro}
            {leadDays ? ` ${t.deadlineNote(leadDays)}` : ''}
          </p>

          {loading ? <p className="muted">{t.loading}</p> : null}

          {!loading && loadFailed ? (
            <section className="panel">
              <p className="alert alert-error" role="alert">
                {t.loadError}
              </p>
              <button type="button" className="btn-secondary" onClick={load}>
                {t.retry}
              </button>
            </section>
          ) : null}

          {!loading && !loadFailed && sessions.length === 0 ? (
            <p className="alert alert-info">{t.noSessions}</p>
          ) : null}

          {!loading && !loadFailed && sessions.length > 0 ? (
            <section className="panel">
              <div className="panel-head">
                <h2>{t.sessionsHeading}</h2>
              </div>
              <SessionList
                sessions={sessions}
                selectedKey={selected ? selected.key : null}
                onSelect={(session) => {
                  setServerError('');
                  setSelectedKey(session.key === selectedKey ? null : session.key);
                }}
                lang={lang}
                t={t}
              />
            </section>
          ) : null}

          {selected ? (
            <section className="panel">
              <div className="selected-bar">
                <span>
                  <strong>{t.selected}</strong> {formatDate(selected.date, lang)}
                  {selected.time ? `, ${selected.time}` : ''}
                  {selected.room ? ` · ${t.room} ${selected.room}` : ''}
                </span>
                <button type="button" className="link" onClick={() => setSelectedKey(null)}>
                  {t.changeSession}
                </button>
              </div>

              <div className="expected">
                <div className="expected-row">
                  <span className="expected-label">{t.attendance}</span>
                  <span className="expected-time">
                    {selected.time || formatDate(selected.date, lang)}
                  </span>
                  <span className="expected-note">{t.attendanceWhole}</span>
                </div>
                <p className="expected-hint">{t.timeHint}</p>
              </div>

              <RegistrationForm
                session={selected}
                supervisors={supervisors}
                t={t}
                submitting={submitting}
                serverError={serverError}
                onSubmit={handleSubmit}
              />
            </section>
          ) : null}

          {!selected && serverError ? (
            <p className="alert alert-error" role="alert">
              {serverError}
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}
