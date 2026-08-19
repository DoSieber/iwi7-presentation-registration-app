/**
 * Cloudflare Worker that fronts two Power Automate flows.
 *
 * The browser never sees a flow URL. It only ever talks to this worker, and the
 * worker holds the signed flow URLs as encrypted secrets. Everything below is
 * either input validation, origin checking or rate limiting.
 */

const MAX_BODY_BYTES = 8 * 1024;
const RATE_LIMIT_MAX = 8; // registrations per window, per IP
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const REGISTER_ATTEMPTS = 3; // one call plus two retries on an ETag conflict
const DEFAULT_LEAD_DAYS = 14; // registration closes this many days before a session

/**
 * Best-effort rate limit. Workers isolates are short-lived and there are many
 * of them, so this bucket is not global state. It stops a naive script hammering
 * one connection and nothing more. Turnstile is what actually keeps bots out.
 */
const buckets = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const hits = (buckets.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  buckets.set(ip, hits);
  if (buckets.size > 5000) buckets.clear();
  return hits.length > RATE_LIMIT_MAX;
}

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = allowedOrigins(env);
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(body, status, request, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request, env),
    },
  });
}

/**
 * A browser request carries an Origin header. A curl request usually does not.
 * We reject anything with a foreign Origin outright, which stops other websites
 * from embedding a form that posts into your SharePoint list.
 */
function originRejected(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  return !allowedOrigins(env).includes(origin);
}

async function verifyTurnstile(token, ip, env) {
  if (!env.TURNSTILE_SECRET) return true; // not configured, skip
  if (!token) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  return data.success === true;
}

// Deliberately stricter than the RFC. The address is pasted into an OData
// filter inside the flow, so an apostrophe would let a submitted value close
// the quote and rewrite the filter. Real university addresses fit this shape.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
// A session key is pasted into an OData filter inside the flow, so it is kept
// to characters that cannot change the meaning of that filter.
const SESSION_KEY_RE = /^[A-Za-z0-9_.:-]{1,60}$/;

function str(value, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

/**
 * Power Automate stringifies values that pass through a quoted token, so a
 * Yes/No column can arrive as true, 1, "true", "1" or "Yes" depending on how
 * the Select mapping was written. All of them mean the same thing here.
 * `fallback` decides how a missing value is read, which differs per field.
 */
function truthy(value, fallback = false) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return ['true', '1', 'yes'].includes(value.trim().toLowerCase());
  return fallback;
}

/**
 * Turns the two lists into what the browser sees.
 *
 * `sessions` are the bookable dates with their capacity, `registrations` are
 * the dates of existing registrations and nothing else. Counting here rather
 * than in the flow keeps the flow to two reads and means the registration list
 * never has to expose anything but a date.
 *
 * This is the privacy boundary of the whole app. What leaves is a count per
 * date. No row ids, no names, so the browser cannot address a specific row and
 * nothing identifying is exposed.
 */
function leadDays(env) {
  const configured = Number(env.REGISTRATION_LEAD_DAYS);
  return Number.isInteger(configured) && configured >= 0 ? configured : DEFAULT_LEAD_DAYS;
}

/** The earliest session date that is still bookable today, as yyyy-MM-dd. */
function earliestBookableDate(env) {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() + leadDays(env));
  return cutoff.toISOString().slice(0, 10);
}

function buildSessions(sessions, registrations, env) {
  const taken = new Map();
  for (const row of registrations) {
    const date = row && row.date;
    if (!date) continue;
    taken.set(date, (taken.get(date) || 0) + 1);
  }

  // Registration closes a fixed number of days before the session, so that the
  // invitations can go out and the exact times can be assigned. The flow filters
  // on this too, this is the backstop.
  const cutoff = earliestBookableDate(env);

  const out = [];
  for (const session of sessions) {
    const date = session && session.date;
    if (!date || date < cutoff) continue;
    if (!truthy(session.isOpen, true)) continue;

    const totalCount = Number(session.maxPlaces);
    if (!Number.isInteger(totalCount) || totalCount < 1) continue;

    const freeCount = totalCount - (taken.get(date) || 0);
    if (freeCount < 1) continue; // full sessions are not offered at all

    out.push({
      key: session.key || date,
      date,
      time: session.time || '',
      room: session.room || '',
      freeCount,
      totalCount,
    });
  }

  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/**
 * Optional allowlist of email domains. Empty means every domain is accepted.
 * Set it in wrangler.toml as ALLOWED_EMAIL_DOMAINS, comma separated.
 */
function emailDomainAllowed(email, env) {
  const allowed = (env.ALLOWED_EMAIL_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
  if (allowed.length === 0) return true;
  const domain = email.split('@')[1].toLowerCase();
  return allowed.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** Returns { payload } or { error } with a machine-readable field name. */
function validateRegistration(body) {
  const sessionKey = str(body.sessionKey, 60);
  if (!sessionKey || !SESSION_KEY_RE.test(sessionKey)) return { error: 'sessionKey' };

  const firstName = str(body.firstName, 80);
  if (!firstName) return { error: 'firstName' };

  const lastName = str(body.lastName, 80);
  if (!lastName) return { error: 'lastName' };

  const email = str(body.email, 160);
  if (!email || !EMAIL_RE.test(email)) return { error: 'email' };

  const matriculation = str(body.matriculation, 40);
  if (!matriculation) return { error: 'matriculation' };

  const thesisType = str(body.thesisType, 20);
  if (!thesisType || !['Bachelor', 'Master'].includes(thesisType)) return { error: 'thesisType' };

  const presentationType = str(body.presentationType, 20);
  if (!presentationType || !['Interim', 'Final'].includes(presentationType))
    return { error: 'presentationType' };

  const thesisTitle = str(body.thesisTitle, 250);
  if (!thesisTitle) return { error: 'thesisTitle' };

  const supervisorId = Number(body.supervisorId);
  if (!Number.isInteger(supervisorId) || supervisorId <= 0) return { error: 'supervisorId' };

  return {
    payload: {
      sessionKey,
      firstName,
      lastName,
      email,
      matriculation,
      thesisType,
      presentationType,
      thesisTitle,
      supervisorId,
    },
  };
}

async function callFlow(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data, text };
}

async function handleSessions(request, env) {
  if (!env.FLOW_GET_URL) return json({ error: 'not_configured' }, 500, request, env);

  const upstream = await callFlow(env.FLOW_GET_URL, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!upstream.ok || !upstream.data) {
    console.log('slots flow failed', upstream.status, upstream.text.slice(0, 500));
    return json({ error: 'upstream_error' }, 502, request, env);
  }

  const sessions = Array.isArray(upstream.data.sessions) ? upstream.data.sessions : [];
  const registrations = Array.isArray(upstream.data.registrations)
    ? upstream.data.registrations
    : [];
  const supervisors = Array.isArray(upstream.data.supervisors) ? upstream.data.supervisors : [];

  return json(
    {
      sessions: buildSessions(sessions, registrations, env),
      // Told to the frontend so it can name the deadline without hardcoding it.
      leadDays: leadDays(env),
      // Ids are normalised to numbers, because a quoted token in the flow's
      // Select turns them into strings and the form compares them by value.
      // A missing isActive is read as active, an explicit "false" is not.
      supervisors: supervisors
        .filter((s) => truthy(s.isActive, true))
        .map((s) => ({ id: Number(s.id), name: String(s.name || '') }))
        .filter((s) => Number.isInteger(s.id) && s.id > 0 && s.name),
    },
    200,
    request,
    env
  );
}

async function handleRegister(request, env, ip) {
  if (!env.FLOW_REGISTER_URL) return json({ error: 'not_configured' }, 500, request, env);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413, request, env);

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'invalid_json' }, 400, request, env);
  }

  if (!(await verifyTurnstile(body.turnstileToken, ip, env))) {
    return json({ error: 'captcha_failed' }, 403, request, env);
  }

  const { payload, error } = validateRegistration(body);
  if (error) return json({ error: 'invalid_field', field: error }, 400, request, env);

  // Checked after the format, so a typo reports as a typo and not as a domain
  // problem. The flow resolves this address against the directory afterwards.
  if (!emailDomainAllowed(payload.email, env)) {
    return json({ error: 'email_domain', field: 'email' }, 400, request, env);
  }

  if (rateLimited(ip)) return json({ error: 'rate_limited' }, 429, request, env);

  // A page left open past the deadline would otherwise still submit. The flow
  // refuses too, this saves the round trip and gives a precise message.
  if (payload.sessionKey < earliestBookableDate(env)) {
    return json({ error: 'deadline_passed' }, 409, request, env);
  }

  // Power Automate refuses Concurrency Control on a workflow with a synchronous
  // Response, so registrations cannot be serialised at the trigger. The flow
  // instead updates the row conditionally on its ETag and answers
  // 409 slot_conflict when another run got there first. Retrying re-runs the
  // "lowest free position" query, so the second attempt takes the next one and
  // the student never sees the collision.
  let upstream;
  for (let attempt = 1; attempt <= REGISTER_ATTEMPTS; attempt++) {
    upstream = await callFlow(env.FLOW_REGISTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });

    const conflicted =
      upstream.status === 409 && upstream.data && upstream.data.error === 'slot_conflict';
    if (!conflicted) break;

    console.log(`slot_conflict on attempt ${attempt} for ${payload.sessionKey}`);
    if (attempt === REGISTER_ATTEMPTS) {
      return json({ error: 'try_again' }, 409, request, env);
    }
  }

  // The flow uses 409 for two different refusals, so the body decides which
  // message the student gets. Anything unrecognised falls back to the common
  // case, an afternoon that filled up during the form.
  if (upstream.status === 409) {
    const code = upstream.data && upstream.data.error === 'already_registered'
      ? 'already_registered'
      : 'session_full';
    return json({ error: code }, 409, request, env);
  }

  // A supervisor who was retired between page load and submit. Passed through
  // rather than hidden behind a generic error, because the student can fix it
  // by picking someone else.
  if (upstream.status === 400 && upstream.data && upstream.data.error === 'invalid_supervisor') {
    return json({ error: 'invalid_supervisor', field: 'supervisorId' }, 400, request, env);
  }

  if (!upstream.ok) {
    console.log('register flow failed', upstream.status, upstream.text.slice(0, 500));
    return json({ error: 'upstream_error' }, 502, request, env);
  }

  // Echoed from the flow, never from the browser, so the confirmation reflects
  // what was actually written.
  const slot = (upstream.data && upstream.data.slot) || {};
  return json(
    {
      ok: true,
      slot: {
        date: slot.date || '',
        time: slot.time || '',
        room: slot.room || '',
      },
    },
    200,
    request,
    env
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (originRejected(request, env)) {
      return json({ error: 'forbidden_origin' }, 403, request, env);
    }

    try {
      if (url.pathname === '/api/sessions' && request.method === 'GET') {
        return await handleSessions(request, env);
      }
      if (url.pathname === '/api/register' && request.method === 'POST') {
        return await handleRegister(request, env, ip);
      }
    } catch (err) {
      console.log('unhandled', err && err.stack);
      return json({ error: 'server_error' }, 500, request, env);
    }

    return json({ error: 'not_found' }, 404, request, env);
  },
};
