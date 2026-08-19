import { formatDate } from '../i18n';

/**
 * One card per session. Deliberately shows a counter rather than individual
 * positions, so no conclusion can be drawn about who is already registered.
 */
export function SessionList({ sessions, selectedKey, onSelect, lang, t }) {
  return (
    <ul className="session-list">
      {sessions.map((session) => {
        const selected = session.key === selectedKey;
        const last = session.freeCount === 1;
        const details = [session.time, session.room ? `${t.room} ${session.room}` : '']
          .filter(Boolean)
          .join(' · ');

        return (
          <li key={session.key}>
            <button
              type="button"
              className={selected ? 'session is-selected' : 'session'}
              aria-pressed={selected}
              onClick={() => onSelect(session)}
            >
              <span className="session-main">
                <span className="session-date">{formatDate(session.date, lang)}</span>
                {details ? <span className="session-meta">{details}</span> : null}
              </span>
              <span className={last ? 'session-count is-last' : 'session-count'}>
                {last ? t.lastPlace : t.placesFree(session.freeCount, session.totalCount)}
              </span>
              <span className="session-action">{selected ? t.selected : t.select}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
