/**
 * Local stand-in for the worker plus the two Power Automate flows.
 *
 * Answers the same contract as the real worker, with in-memory data that
 * resets on restart. Use it to develop the frontend before the flows exist,
 * and to test the full-session path without touching SharePoint.
 *
 *   node worker/mock-api.mjs        ->  http://localhost:8787
 */
import { createServer } from 'node:http';

const PORT = 8787;
const MAX_PLACES = 5;
const LEAD_DAYS = 14;
const SESSION_TIME = '13:00 - 17:30';

const SUPERVISORS = [
  { id: 2, name: 'Dominic Sieber', isActive: true },
  { id: 3, name: 'Marc Grau', isActive: true },
  { id: 7, name: 'Prof. Dr. Ivo Blohm', isActive: true },
];

/** Three sessions, the first just past the registration deadline. */
function seedSessions() {
  const out = [];
  const day = new Date();
  day.setDate(day.getDate() + LEAD_DAYS);

  for (let added = 0; added < 3; ) {
    day.setDate(day.getDate() + 1);
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    const date = day.toISOString().slice(0, 10);
    out.push({
      key: date,
      date,
      time: SESSION_TIME,
      room: added === 1 ? '62-101' : '01-013',
      maxPlaces: MAX_PLACES,
      isOpen: true,
    });
    added++;
  }
  return out;
}

let sessions = seedSessions();
// Two places of the first session are taken, so the counter shows 3 of 5.
let registrations = [
  { date: sessions[0].date, email: 'vorbelegt1@example.org' },
  { date: sessions[0].date, email: 'vorbelegt2@example.org' },
];

function buildSessions() {
  const taken = new Map();
  for (const r of registrations) taken.set(r.date, (taken.get(r.date) || 0) + 1);

  return sessions
    .filter((s) => s.isOpen)
    .map((s) => ({
      key: s.key,
      date: s.date,
      time: s.time,
      room: s.room,
      freeCount: s.maxPlaces - (taken.get(s.date) || 0),
      totalCount: s.maxPlaces,
    }))
    .filter((s) => s.freeCount > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') return send(res, 204, {});

  if (req.method === 'GET' && url.pathname === '/api/sessions') {
    const out = buildSessions();
    console.log('GET /api/sessions ->', out.length, 'session(s)');
    return send(res, 200, { sessions: out, leadDays: LEAD_DAYS, supervisors: SUPERVISORS });
  }

  if (req.method === 'POST' && url.pathname === '/api/register') {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return send(res, 400, { error: 'invalid_json' });
      }

      // Append ?fail=full to the request to rehearse the conflict path.
      if (url.searchParams.get('fail') === 'full') return send(res, 409, { error: 'session_full' });

      const session = sessions.find((s) => s.key === body.sessionKey && s.isOpen);
      if (!session) return send(res, 409, { error: 'session_full' });

      const used = registrations.filter((r) => r.date === session.date).length;
      if (used >= session.maxPlaces) return send(res, 409, { error: 'session_full' });

      registrations.push({ date: session.date, email: body.email });
      console.log('POST /api/register ->', session.date, body.email, `${used + 1}/${session.maxPlaces}`);

      return send(res, 200, {
        ok: true,
        slot: { date: session.date, time: session.time, room: session.room },
      });
    });
    return undefined;
  }

  if (req.method === 'POST' && url.pathname === '/api/reset') {
    sessions = seedSessions();
    registrations = [
      { date: sessions[0].date, email: 'vorbelegt1@example.org' },
      { date: sessions[0].date, email: 'vorbelegt2@example.org' },
    ];
    console.log('reset');
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'not_found' });
});

server.listen(PORT, () => {
  console.log(`mock API on http://localhost:${PORT}`);
  console.log('  GET  /api/sessions');
  console.log('  POST /api/register        (add ?fail=full to force a 409)');
  console.log('  POST /api/reset           clears every registration again');
});
