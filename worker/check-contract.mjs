/**
 * Checks a Power Automate flow, or the deployed worker, against the contract
 * this app expects. Run it locally so no flow URL ever leaves your machine.
 *
 *   node worker/check-contract.mjs flow-get
 *   node worker/check-contract.mjs worker
 *   node worker/check-contract.mjs flow-register 2026-08-19-PM --confirm
 *
 * URLs are read from worker/.dev.vars, so nothing sensitive lands in your
 * shell history. The last command books a real position, hence --confirm.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

function readEnv() {
  let raw;
  try {
    raw = readFileSync(join(HERE, '.dev.vars'), 'utf8');
  } catch {
    console.log('\n  worker/.dev.vars not found. Copy .dev.vars.example and fill in the URLs.\n');
    process.exit(1);
  }
  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }

  // Two mistakes that would otherwise show up as a confusing HTTP error.
  for (const key of ['FLOW_GET_URL', 'FLOW_REGISTER_URL']) {
    if (env[key] && env[key].includes('PASTE_HERE')) {
      console.log(`\n  ${key} in worker/.dev.vars is still the placeholder.\n`);
      process.exit(1);
    }
  }
  if (env.FLOW_GET_URL && env.FLOW_GET_URL === env.FLOW_REGISTER_URL) {
    console.log('\n  FLOW_GET_URL and FLOW_REGISTER_URL are the same URL. Each flow has its own.\n');
    process.exit(1);
  }

  return env;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KEY_RE = /^[A-Za-z0-9_.:-]{1,60}$/;

const SESSION_FIELDS = new Set(['key', 'date', 'time', 'room', 'maxPlaces', 'isOpen']);
const REGISTRATION_FIELDS = new Set(['date']);
const PERSONAL = /student|mail|matrik|thesis|vorname|nachname|firstname|lastname/i;

/** Same tolerance as the worker, so the preview shows what the app will show. */
function truthy(value, fallback = false) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return ['true', '1', 'yes'].includes(value.trim().toLowerCase());
  return fallback;
}

const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

function report() {
  console.log('');
  for (const w of warnings) console.log(`  WARN   ${w}`);
  for (const e of errors) console.log(`  ERROR  ${e}`);
  console.log('');
  if (errors.length === 0 && warnings.length === 0) console.log('  Contract OK.\n');
  else console.log(`  ${errors.length} error(s), ${warnings.length} warning(s)\n`);
  process.exit(errors.length > 0 ? 1 : 0);
}

async function getJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  console.log(`  HTTP ${res.status}, ${text.length} bytes`);
  if (!res.ok) {
    fail(`request failed with ${res.status}. First 300 characters:\n         ${text.slice(0, 300)}`);
    report();
  }
  try {
    return JSON.parse(text);
  } catch {
    fail(`response is not JSON. First 300 characters:\n         ${text.slice(0, 300)}`);
    return report();
  }
}

/** The single most common Power Automate mistake, worth naming precisely. */
function checkArray(value, name, selectName) {
  if (Array.isArray(value)) return true;
  if (typeof value === 'string') {
    fail(
      `"${name}" came back as a string, not an array. In the flow's Response body ` +
      `the token is wrapped in quotes. Remove them, so the line reads ` +
      `"${name}": @{body('${selectName}')} with no quotes around the @{...}.`
    );
    return false;
  }
  fail(`"${name}" is missing from the response (got ${typeof value}).`);
  return false;
}

function checkSessionRow(row, index) {
  const at = `sessions[${index}]`;

  if (!DATE_RE.test(String(row.date)))
    fail(`${at}.date is "${row.date}", expected yyyy-MM-dd from formatDateTime(PresentationDate, 'yyyy-MM-dd').`);

  if (row.key != null && !KEY_RE.test(String(row.key)))
    fail(`${at}.key "${row.key}" contains characters the worker rejects. Allowed: letters, digits, - _ . :`);

  const max = Number(row.maxPlaces);
  if (!Number.isInteger(max) || max < 1)
    fail(`${at}.maxPlaces is ${JSON.stringify(row.maxPlaces)}, expected a whole number of at least 1.`);
  else if (typeof row.maxPlaces !== 'number')
    warn(`${at}.maxPlaces is a string. The worker converts it, but an unquoted token in the Select is cleaner.`);

  if (row.time != null && typeof row.time !== 'string')
    warn(`${at}.time is ${JSON.stringify(row.time)}, expected free text such as "13:00 - 17:30" or nothing.`);

  for (const key of Object.keys(row)) {
    if (SESSION_FIELDS.has(key)) continue;
    if (PERSONAL.test(key))
      fail(`${at} carries "${key}". Personal data must not leave the flow. Remove it from the Select action.`);
    else warn(`${at} carries an unknown field "${key}". Harmless, but the worker ignores it.`);
  }
}

function checkRegistrationRow(row, index) {
  const at = `registrations[${index}]`;

  if (!DATE_RE.test(String(row.date)))
    fail(`${at}.date is "${row.date}", expected yyyy-MM-dd.`);

  for (const key of Object.keys(row)) {
    if (REGISTRATION_FIELDS.has(key)) continue;
    fail(
      `${at} carries "${key}". The registrations Select must map the date and nothing else, ` +
      `otherwise student data reaches every browser.`
    );
  }
}

/** Mirrors the worker's counting, so you can eyeball what students will see. */
function preview(sessions, registrations, leadDays = 14) {
  const taken = new Map();
  for (const r of registrations) taken.set(r.date, (taken.get(r.date) || 0) + 1);
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() + leadDays);
  const limit = cutoff.toISOString().slice(0, 10);

  console.log('\n  What students would see\n');
  let shown = 0;

  for (const s of [...sessions].sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    const max = Number(s.maxPlaces);
    const free = max - (taken.get(s.date) || 0);
    const label = `${s.date}${s.time ? `  ${s.time}` : ''}`;

    if (s.date < limit) console.log(`    ${label}  past the ${leadDays} day deadline, hidden`);
    else if (!truthy(s.isOpen, true)) console.log(`    ${label}  closed, hidden`);
    else if (free < 1) console.log(`    ${label}  FULL, hidden`);
    else {
      console.log(`    ${label}  ${free} of ${max} places free`);
      shown++;
    }
  }

  if (shown === 0) console.log('    (nothing bookable)');
}

async function checkFlowGet(url) {
  console.log('\nChecking the GET flow against the contract\n');
  const data = await getJson(url, { headers: { Accept: 'application/json' } });

  const rawMarkers = ['@odata.etag', 'ItemInternalId', '{Identifier}', 'Editor#Claims'];
  const looksRaw = (arr) =>
    Array.isArray(arr) && arr.length > 0 && rawMarkers.some((m) => m in arr[0]);

  if (looksRaw(data.sessions) || looksRaw(data.registrations) || looksRaw(data.supervisors)) {
    fail(
      `the flow is returning raw SharePoint items, not the output of a Select.\n` +
      `         The Select actions are either missing, or the Response body still points at a\n` +
      `         Get items action instead of body('Select_sessions'), body('Select_registrations')\n` +
      `         and body('Select_supervisors'). Open the Response action and check its code view.\n` +
      `         Until this is fixed the flow hands student data to anyone who calls the URL.`
    );
    report();
  }

  const sessionsOk = checkArray(data.sessions, 'sessions', 'Select_sessions');
  const regsOk = checkArray(data.registrations, 'registrations', 'Select_registrations');
  const supsOk = checkArray(data.supervisors, 'supervisors', 'Select_supervisors');

  if (sessionsOk) {
    console.log(`  ${data.sessions.length} session(s), ${regsOk ? data.registrations.length : '?'} registration(s)`);
    if (data.sessions.length === 0)
      warn('no sessions returned. Either the Sessions list is empty or the date filter excludes everything.');
    data.sessions.forEach(checkSessionRow);
  }

  if (regsOk) data.registrations.forEach(checkRegistrationRow);

  if (sessionsOk && regsOk) preview(data.sessions, data.registrations, Number(process.env.LEAD_DAYS) || 14);

  if (supsOk) {
    console.log(`\n  ${data.supervisors.length} supervisor(s) in the dropdown`);
    data.supervisors.forEach((s, i) => {
      if (!Number.isInteger(s.id)) {
        if (Number.isInteger(Number(s.id)))
          warn(`supervisors[${i}].id is ${JSON.stringify(s.id)}, a string. The worker converts it, but an unquoted token in the Select is cleaner.`);
        else fail(`supervisors[${i}].id is ${JSON.stringify(s.id)}, expected a whole number.`);
      }
      if (!s.name) fail(`supervisors[${i}].name is empty.`);
      for (const key of Object.keys(s)) {
        if (['id', 'name', 'isActive'].includes(key)) continue;
        if (PERSONAL.test(key))
          fail(`supervisors[${i}] carries "${key}". Do not map supervisor emails into the response.`);
      }
    });
    if (data.supervisors.length === 0)
      warn('no supervisors returned, so the dropdown will be empty and nobody can submit.');
  }

  report();
}

async function checkWorker(base) {
  console.log('\nChecking the worker against the contract\n');
  const data = await getJson(`${base.replace(/\/$/, '')}/api/sessions`, {
    headers: { Accept: 'application/json', Origin: 'http://localhost:5173' },
  });

  if (!checkArray(data.sessions, 'sessions', 'Select_slots')) report();
  console.log(`  ${data.sessions.length} session(s) offered\n`);

  data.sessions.forEach((s, i) => {
    const at = `sessions[${i}]`;
    if (!KEY_RE.test(String(s.key))) fail(`${at}.key "${s.key}" is not a usable session key.`);
    if (!DATE_RE.test(String(s.date))) fail(`${at}.date is "${s.date}".`);
    if (!Number.isInteger(s.freeCount) || s.freeCount < 1)
      fail(`${at}.freeCount is ${s.freeCount}. Full sessions should not be listed at all.`);
    if (s.freeCount > s.totalCount) fail(`${at} claims ${s.freeCount} free of ${s.totalCount} total.`);
    if ('id' in s || 'slotId' in s) fail(`${at} exposes a row id. The browser must not be able to address a place.`);
    console.log(`    ${s.date}${s.time ? `  ${s.time}` : ''}  ${s.freeCount} of ${s.totalCount} places free`);
  });

  const blob = JSON.stringify(data);
  for (const needle of ['@student', 'Matrik', 'StudentEmail', 'ThesisTitle']) {
    if (blob.includes(needle)) fail(`the worker response contains "${needle}". Personal data is leaking through.`);
  }

  report();
}

/** Picks a real supervisor id from flow 1, so the test does not fail on a guess. */
async function firstSupervisorId(env) {
  if (!env.FLOW_GET_URL) return null;
  try {
    const res = await fetch(env.FLOW_GET_URL, { headers: { Accept: 'application/json' } });
    const data = await res.json();
    const list = Array.isArray(data.supervisors) ? data.supervisors : [];
    for (const s of list) {
      const id = Number(s.id);
      if (Number.isInteger(id) && id > 0) return id;
    }
  } catch {
    // Falls through to the caller's error message.
  }
  return null;
}

async function checkFlowRegister(url, sessionKey, confirmed, supervisorId) {
  if (!confirmed) {
    console.log(
      '\n  This books a real position in the SharePoint list and cannot be undone\n' +
      '  automatically. Add --confirm if you have a throwaway afternoon to spend.\n'
    );
    process.exit(1);
  }

  console.log(`\nRegistering a test student into ${sessionKey}, supervisor id ${supervisorId}\n`);
  const data = await getJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sessionKey,
      firstName: 'Contract',
      lastName: 'Check',
      email: 'contract.check@example.org',
      matriculation: '00-000-000',
      thesisType: 'Master',
      presentationType: 'Final',
      thesisTitle: 'Contract check, please delete this row',
      supervisorId,
    }),
  });

  if (data.ok !== true) fail(`expected {"ok": true}, got ${JSON.stringify(data).slice(0, 200)}`);
  const slot = data.slot || {};
  if (!DATE_RE.test(String(slot.date))) fail(`slot.date is "${slot.date}", expected yyyy-MM-dd.`);
  else console.log(`  Booked a place on ${slot.date}${slot.time ? `, ${slot.time}` : ''}${slot.room ? `, room ${slot.room}` : ''}`);

  console.log('\n  Remember to free that row again in SharePoint.');
  report();
}

/** Whole-setup overview: what is verified, what is broken, what is still open. */
async function status(env) {
  const OK = '  [x]';
  const NO = '  [ ]';
  const WARNI = '  [!]';
  const lines = [];
  const todo = [];
  const say = (mark, text) => lines.push(`${mark} ${text}`);

  console.log('\nSetup status\n');

  // --- Flow 1 -------------------------------------------------------------
  let data = null;
  if (!env.FLOW_GET_URL || env.FLOW_GET_URL.includes('PASTE_HERE')) {
    say(NO, 'Flow 1 URL not set in worker/.dev.vars');
    todo.push('Paste the GET flow URL into worker/.dev.vars');
  } else {
    try {
      const res = await fetch(env.FLOW_GET_URL, { headers: { Accept: 'application/json' } });
      const text = await res.text();
      if (!res.ok) {
        say(NO, `Flow 1 answers HTTP ${res.status}`);
        todo.push('Fix flow 1, run: node worker/check-contract.mjs flow-get');
      } else {
        data = JSON.parse(text);
        const raw = Array.isArray(data.sessions) && data.sessions.length > 0 && '@odata.etag' in data.sessions[0];
        if (typeof data.sessions === 'string' || typeof data.supervisors === 'string') {
          say(NO, 'Flow 1 returns strings instead of arrays');
          todo.push('Remove the quotes around the tokens in the Response body of flow 1');
        } else if (raw) {
          say(NO, 'Flow 1 returns raw SharePoint items, and with them student data');
          todo.push('Point the Response body of flow 1 at the Select actions');
        } else if (!Array.isArray(data.sessions)) {
          say(NO, `Flow 1 returns no sessions array, top-level keys are ${Object.keys(data).join(', ')}`);
          todo.push('Rebuild flow 1 for the sessions contract, see docs/power-automate-flows.md');
          data = null;
        } else if (!Array.isArray(data.registrations)) {
          say(NO, 'Flow 1 returns sessions but no registrations array, so every session looks empty');
          todo.push('Add Get_registrations and Select_registrations to flow 1');
        } else {
          say(OK, `Flow 1 answers the contract, ${text.length} bytes`);
        }
      }
    } catch (err) {
      say(NO, `Flow 1 unreachable: ${err.message}`);
    }
  }

  // --- Data in the lists --------------------------------------------------
  if (data && Array.isArray(data.sessions)) {
    const regs = Array.isArray(data.registrations) ? data.registrations : [];
    const taken = new Map();
    for (const r of regs) taken.set(r.date, (taken.get(r.date) || 0) + 1);
    const today = new Date().toISOString().slice(0, 10);

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() + 14);
    const limit = cutoff.toISOString().slice(0, 10);
    const upcoming = data.sessions.filter((s) => String(s.date) >= limit);
    if (upcoming.length === 0) {
      say(NO, `No bookable sessions. Registration closes 14 days before a session, so a row needs a date after ${limit}`);
      todo.push('Add a row to the Sessions list with a date at least 14 days out');
    } else {
      say(OK, `${upcoming.length} upcoming session(s): ${upcoming
        .map((s) => `${s.date} (${Number(s.maxPlaces) - (taken.get(s.date) || 0)}/${s.maxPlaces})`)
        .join(', ')}`);
    }

    if (regs.length === 0) {
      say(WARNI, 'No registration yet, so flow 2 has never run end to end');
      todo.push('Test flow 2 with: node worker/check-contract.mjs flow-register <date> --confirm');
    } else {
      say(OK, `${regs.length} registration(s), so flow 2 writes`);
    }

    const noTime = upcoming.filter((s) => !s.time);
    if (noTime.length > 0)
      say(WARNI, `${noTime.length} session(s) without SessionTime, students only see a date`);

    const noRoom = upcoming.filter((s) => !s.room);
    if (noRoom.length > 0) say(WARNI, `${noRoom.length} session(s) without Room (optional)`);
  }

  // --- Worker -------------------------------------------------------------
  if (env.WORKER_URL && !env.WORKER_URL.includes('your-subdomain')) {
    try {
      const res = await fetch(`${env.WORKER_URL.replace(/\/$/, '')}/api/sessions`, {
        headers: { Origin: 'http://localhost:5173' },
      });
      if (res.ok) say(OK, 'Worker deployed and answering');
      else say(NO, `Worker answers HTTP ${res.status}`);
    } catch {
      say(NO, 'Worker URL set but unreachable');
    }
  } else {
    say(NO, 'Worker not deployed to Cloudflare yet');
    todo.push('cd worker && npx wrangler secret put FLOW_GET_URL && npx wrangler deploy');
  }

  // --- Things no request can verify ---------------------------------------
  console.log(lines.join('\n'));
  console.log('\n  Cannot be checked from here\n');
  console.log('    - Whether flow 2 writes only the fields it should, check one row in Registrations');
  console.log('    - The StudentEmail column, needed for the duplicate check');
  console.log('    - Whether flow 2 refuses a sixth registration for a session of five');
  console.log('    - Whether the daily closing flow sends the invitations at the deadline');
  console.log('    - ALLOWED_ORIGINS with your GitHub Pages and TYPO3 origins');
  console.log('    - GitHub Pages enabled, VITE_API_BASE set as a repository variable');
  console.log('    - The iframe embedded in TYPO3');

  if (todo.length > 0) {
    console.log('\n  Next\n');
    todo.forEach((item, i) => console.log(`    ${i + 1}. ${item}`));
  } else {
    console.log('\n  Nothing left that this tool can see.');
  }
  console.log('');
  process.exit(0);
}

const env = readEnv();
const [mode, arg2] = process.argv.slice(2);
const confirmed = process.argv.includes('--confirm');

if (mode === 'status') {
  await status(env);
} else if (mode === 'inspect') {
  if (!env.FLOW_GET_URL) { console.log('\n  FLOW_GET_URL is not set in worker/.dev.vars\n'); process.exit(1); }
  await inspect(env.FLOW_GET_URL);
} else if (mode === 'flow-get') {
  if (!env.FLOW_GET_URL) { console.log('\n  FLOW_GET_URL is not set in worker/.dev.vars\n'); process.exit(1); }
  await checkFlowGet(env.FLOW_GET_URL);
} else if (mode === 'worker') {
  const base = arg2 || env.WORKER_URL;
  if (!base) { console.log('\n  Pass a worker URL, or set WORKER_URL in worker/.dev.vars\n'); process.exit(1); }
  await checkWorker(base);
} else if (mode === 'flow-register' && arg2) {
  if (!env.FLOW_REGISTER_URL) { console.log('\n  FLOW_REGISTER_URL is not set in worker/.dev.vars\n'); process.exit(1); }
  const explicit = process.argv.find((a) => /^--supervisor=\d+$/.test(a));
  const supervisorId = explicit
    ? Number(explicit.split('=')[1])
    : await firstSupervisorId(env);
  if (!supervisorId) {
    console.log('\n  No usable supervisor id. Pass one with --supervisor=2\n');
    process.exit(1);
  }
  await checkFlowRegister(env.FLOW_REGISTER_URL, arg2, confirmed, supervisorId);
} else {
  console.log(`
Usage (URLs are read from worker/.dev.vars):

  node worker/check-contract.mjs status
  node worker/check-contract.mjs inspect
  node worker/check-contract.mjs flow-get
  node worker/check-contract.mjs worker ["https://<name>.<sub>.workers.dev"]
  node worker/check-contract.mjs flow-register <sessionKey> --confirm [--supervisor=<id>]
`);
  process.exit(1);
}
