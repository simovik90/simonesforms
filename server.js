const path = require('path');
if (!process.env.VERCEL) {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
}

const express = require('express');
const cookieParser = require('cookie-parser');
const createFormsRouter = require('./lib/formsRouter');
const {
  AUTH_COOKIE_NAME,
  getCookieSecret,
  isAuthenticated,
  requireAuth,
  isPublicFormsApiRoute,
} = require('./lib/sessionAuth');
const dataStore = require('./lib/dataStore');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

const app = express();

const AUTH_EMAIL = String(process.env.AUTH_EMAIL || 'simone@mscommunication.it').trim().toLowerCase();
const AUTH_PASSWORD = String(process.env.AUTH_PASSWORD || '').trim();
const COOKIE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const META_OAUTH_STATE_COOKIE = 'meta_oauth_state';

function timingSafePasswordOk(provided) {
  const a = Buffer.from(AUTH_PASSWORD, 'utf8');
  const b = Buffer.from(String(provided || ''), 'utf8');
  if (!AUTH_PASSWORD) return false;
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Route API accessibili senza login (compilazione pubblica + sessione). */
function isPublicApiRoute(method, p) {
  if (p === '/api/auth/login' && method === 'POST') return true;
  if (p === '/api/auth/logout' && method === 'POST') return true;
  if (p === '/api/auth/me' && method === 'GET') return true;
  if (p === '/api/meta/oauth/connect' && method === 'GET') return true;
  if (p === '/api/meta/oauth/callback' && method === 'GET') return true;
  if (isPublicFormsApiRoute(method, p)) return true;
  return false;
}
const DEFAULT_STAGES = ['Nuovo', 'Contattato', 'Qualificato', 'Vincitore', 'Perso'];

/** In locale serve da qui; su Vercel i file in `public/` sono serviti dalla CDN (express.static è ignorato lì). */
const PUBLIC_ROOT = path.join(__dirname, 'public');

app.use(express.json());
app.use(cookieParser(getCookieSecret()));

app.use('/api', async (req, res, next) => {
  try {
    await dataStore.ensureLoaded();
    next();
  } catch (err) {
    console.error('[dataStore] ensureLoaded', err);
    res.status(503).json({ error: 'Storage non disponibile. Verifica Supabase e la tabella app_data.' });
  }
});

app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  if (isPublicApiRoute(req.method, req.path)) return next();
  return requireAuth(req, res, next);
});

app.post('/api/auth/login', (req, res) => {
  if (!AUTH_PASSWORD) {
    console.warn('[Auth] Imposta AUTH_PASSWORD nel file .env nella cartella del progetto (accanto a server.js).');
    return res.status(503).json({ error: 'Login non configurato: manca AUTH_PASSWORD nel .env' });
  }
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (email !== AUTH_EMAIL || !timingSafePasswordOk(password)) {
    return res.status(401).json({ error: 'Email o password non validi' });
  }
  res.cookie(AUTH_COOKIE_NAME, '1', {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.AUTH_HTTPS === '1',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  });
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

function getExternalOrigin(req) {
  const protoHeader = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = protoHeader || req.protocol || 'http';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!host) return null;
  return `${protocol}://${host}`;
}

function getMetaRedirectUri(req) {
  const configured = String(process.env.META_OAUTH_REDIRECT_URI || '').trim();
  if (configured) return configured;
  const origin = getExternalOrigin(req);
  if (!origin) return null;
  return `${origin}/api/meta/oauth/callback`;
}

function metaApiRequest(pathWithQuery) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'graph.facebook.com',
        port: 443,
        path: pathWithQuery,
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'MyTypeform/1.0 (Node.js)',
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => {
          buf += c;
        });
        res.on('end', () => {
          let json = {};
          try {
            json = buf ? JSON.parse(buf) : {};
          } catch (_) {
            json = { message: buf ? String(buf).slice(0, 500) : '' };
          }
          if (res.statusCode >= 400 || json.error) {
            const msg = json?.error?.message || json?.message || `Meta HTTP ${res.statusCode}`;
            const err = new Error(String(msg));
            err.status = res.statusCode;
            err.detail = json;
            return reject(err);
          }
          resolve(json);
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function getMetaAccessToken(req) {
  const auth = String(req.headers.authorization || '');
  if (auth.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  const fromQuery = String(req.query?.accessToken || '').trim();
  if (fromQuery) return fromQuery;
  const fromEnv = String(process.env.META_ACCESS_TOKEN || '').trim();
  if (fromEnv) return fromEnv;
  return '';
}

function parseInsightsLevel(raw) {
  const level = String(raw || 'account').trim().toLowerCase();
  if (level === 'account' || level === 'campaign' || level === 'adset' || level === 'ad') return level;
  return null;
}

function parsePositiveInt(raw, fallback) {
  const n = Number(String(raw == null ? fallback : raw).trim());
  if (Number.isNaN(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function parseIsoDate(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

app.get('/api/meta/oauth/connect', (req, res) => {
  const appId = String(process.env.META_APP_ID || '').trim();
  if (!appId) return res.status(503).json({ error: 'META_APP_ID mancante nel server' });
  const redirectUri = getMetaRedirectUri(req);
  if (!redirectUri) return res.status(400).json({ error: 'Impossibile calcolare redirect URI' });
  const scopes = String(process.env.META_OAUTH_SCOPES || 'ads_read').trim();
  const state = crypto.randomBytes(24).toString('hex');
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
    scope: scopes,
  });
  const authUrl = `https://www.facebook.com/v22.0/dialog/oauth?${params.toString()}`;
  res.cookie(META_OAUTH_STATE_COOKIE, state, {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.AUTH_HTTPS === '1',
    maxAge: 15 * 60 * 1000,
    path: '/',
  });
  if (String(req.query.mode || '').toLowerCase() === 'json') {
    return res.json({ authUrl, redirectUri, scopes: scopes.split(',').map((x) => x.trim()).filter(Boolean) });
  }
  return res.redirect(authUrl);
});

app.get('/api/meta/oauth/callback', async (req, res) => {
  const state = String(req.query?.state || '');
  const code = String(req.query?.code || '');
  const error = String(req.query?.error || '');
  const errorReason = String(req.query?.error_reason || '');
  const errorDescription = String(req.query?.error_description || '');
  const expectedState = req.signedCookies?.[META_OAUTH_STATE_COOKIE];
  if (error) {
    return res.status(400).json({
      ok: false,
      error,
      errorReason: errorReason || null,
      errorDescription: errorDescription || null,
    });
  }
  if (!state || !expectedState || state !== expectedState) {
    return res.status(400).json({ ok: false, error: 'OAuth state non valido o scaduto' });
  }
  if (!code) return res.status(400).json({ ok: false, error: 'Parametro code mancante' });
  res.clearCookie(META_OAUTH_STATE_COOKIE, { path: '/' });
  const appId = String(process.env.META_APP_ID || '').trim();
  const appSecret = String(process.env.META_APP_SECRET || '').trim();
  const redirectUri = getMetaRedirectUri(req);
  if (!appId || !appSecret || !redirectUri) {
    return res.json({
      ok: true,
      code,
      note: 'Ricevuto code OAuth. Configura META_APP_ID, META_APP_SECRET e META_OAUTH_REDIRECT_URI per scambio token automatico.',
    });
  }
  try {
    const params = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });
    const tokenData = await metaApiRequest(`/v22.0/oauth/access_token?${params.toString()}`);
    return res.json({
      ok: true,
      accessToken: tokenData.access_token || null,
      tokenType: tokenData.token_type || null,
      expiresIn: tokenData.expires_in || null,
    });
  } catch (e) {
    return res.status(e.status && e.status >= 400 && e.status < 600 ? e.status : 500).json({
      ok: false,
      error: e.message || 'Errore scambio token Meta',
      detail: e.detail || null,
    });
  }
});

app.get('/api/meta/adaccounts', async (req, res) => {
  const token = getMetaAccessToken(req);
  if (!token) {
    return res.status(400).json({ error: 'Access token mancante: usa Authorization Bearer o META_ACCESS_TOKEN' });
  }
  try {
    const params = new URLSearchParams({
      fields: 'id,name,account_status,currency,timezone_name',
      access_token: token,
      limit: String(parsePositiveInt(req.query?.limit, 100)),
    });
    const data = await metaApiRequest(`/v22.0/me/adaccounts?${params.toString()}`);
    return res.json({ data: Array.isArray(data.data) ? data.data : [], paging: data.paging || null });
  } catch (e) {
    return res.status(e.status && e.status >= 400 && e.status < 600 ? e.status : 500).json({
      error: e.message || 'Errore lettura ad accounts Meta',
      detail: e.detail || null,
    });
  }
});

app.get('/api/meta/campaigns', async (req, res) => {
  const token = getMetaAccessToken(req);
  if (!token) {
    return res.status(400).json({ error: 'Access token mancante: usa Authorization Bearer o META_ACCESS_TOKEN' });
  }
  const accountId = String(req.query?.accountId || '').trim();
  if (!accountId || !accountId.startsWith('act_')) {
    return res.status(400).json({ error: 'accountId richiesto (formato: act_...)' });
  }
  try {
    const params = new URLSearchParams({
      fields: 'id,name,status,objective',
      access_token: token,
      limit: String(parsePositiveInt(req.query?.limit, 200)),
    });
    const data = await metaApiRequest(`/v22.0/${encodeURIComponent(accountId)}/campaigns?${params.toString()}`);
    return res.json({ data: Array.isArray(data.data) ? data.data : [], paging: data.paging || null });
  } catch (e) {
    return res.status(e.status && e.status >= 400 && e.status < 600 ? e.status : 500).json({
      error: e.message || 'Errore lettura campagne Meta',
      detail: e.detail || null,
    });
  }
});

app.get('/api/meta/insights', async (req, res) => {
  const token = getMetaAccessToken(req);
  if (!token) {
    return res.status(400).json({ error: 'Access token mancante: usa Authorization Bearer o META_ACCESS_TOKEN' });
  }
  const accountId = String(req.query?.accountId || '').trim();
  if (!accountId || !accountId.startsWith('act_')) {
    return res.status(400).json({ error: 'accountId richiesto (formato: act_...)' });
  }
  const level = parseInsightsLevel(req.query?.level);
  if (!level) {
    return res.status(400).json({ error: "level non valido: usa 'account' | 'campaign' | 'adset' | 'ad'" });
  }
  const since = parseIsoDate(req.query?.since);
  const until = parseIsoDate(req.query?.until);
  if ((since && !until) || (!since && until)) {
    return res.status(400).json({ error: "Usa entrambi 'since' e 'until' (YYYY-MM-DD) oppure nessuno dei due" });
  }
  try {
    const params = new URLSearchParams({
      access_token: token,
      fields: 'date_start,date_stop,account_id,account_name,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,cpc,cpm,ctr',
      level,
      time_increment: String(parsePositiveInt(req.query?.timeIncrement, 1)),
      limit: String(parsePositiveInt(req.query?.limit, 500)),
    });
    if (since && until) params.set('time_range', JSON.stringify({ since, until }));
    else params.set('date_preset', String(req.query?.datePreset || 'last_30d'));
    const data = await metaApiRequest(`/v22.0/${encodeURIComponent(accountId)}/insights?${params.toString()}`);
    return res.json({
      data: Array.isArray(data.data) ? data.data : [],
      paging: data.paging || null,
      meta: { accountId, level, since: since || null, until: until || null, datePreset: since ? null : String(req.query?.datePreset || 'last_30d') },
    });
  } catch (e) {
    return res.status(e.status && e.status >= 400 && e.status < 600 ? e.status : 500).json({
      error: e.message || 'Errore lettura insights Meta',
      detail: e.detail || null,
    });
  }
});

function readForms() {
  return dataStore.readForms();
}
function readResponses() {
  return dataStore.readResponses();
}
function readCrm() {
  return dataStore.readCrm();
}
async function writeForms(forms) {
  return dataStore.writeForms(forms);
}
async function writeResponses(responses) {
  return dataStore.writeResponses(responses);
}
async function writeCrm(crm) {
  return dataStore.writeCrm(crm);
}

function brevoNormAttr(name) {
  return String(name || '').trim().toUpperCase().replace(/\s+/g, '_');
}

function formatAnswerForBrevo(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map((x) => String(x)).join(', ');
  return String(value);
}

function brevoExtractErrorMessage(json, statusCode) {
  if (json == null || typeof json !== 'object') return `Brevo HTTP ${statusCode}`;
  if (json.message != null && String(json.message).trim()) return String(json.message).trim();
  if (json.error != null) {
    if (typeof json.error === 'string' && json.error.trim()) return json.error.trim();
    if (typeof json.error === 'object' && json.error.message != null) return String(json.error.message).trim();
  }
  if (json.code != null) return `${json.code} (HTTP ${statusCode})`;
  return `Brevo HTTP ${statusCode}`;
}

function brevoApiRequest(method, apiPath, bodyObj) {
  const key = process.env.BREVO_API_KEY;
  if (!key || !String(key).trim()) return Promise.reject(new Error('Brevo API key mancante'));
  const payload = bodyObj != null ? JSON.stringify(bodyObj) : null;
  const headers = {
    'api-key': String(key).trim(),
    Accept: 'application/json',
    'User-Agent': 'MyTypeform/1.0 (Node.js)',
  };
  if (payload) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(payload);
  }
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.brevo.com',
        port: 443,
        path: '/v3' + apiPath,
        method,
        headers,
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => {
          buf += c;
        });
        res.on('end', () => {
          let json = {};
          try {
            json = buf ? JSON.parse(buf) : {};
          } catch (_) {
            json = { message: buf ? String(buf).slice(0, 500) : '' };
          }
          if (res.statusCode >= 400) {
            const msg = brevoExtractErrorMessage(json, res.statusCode);
            const err = new Error(msg);
            err.status = res.statusCode;
            err.detail = json;
            reject(err);
          } else resolve(json);
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Brevo richiede folderId per POST /contacts/lists. Cache solo se risolto via API. */
let brevoListFolderIdCache = null;

async function getBrevoListFolderId() {
  const fromEnv = process.env.BREVO_LIST_FOLDER_ID;
  if (fromEnv != null && String(fromEnv).trim() !== '') {
    const n = Number(String(fromEnv).trim());
    if (!Number.isNaN(n) && n > 0) return n;
  }
  if (brevoListFolderIdCache != null) return brevoListFolderIdCache;

  const foldersData = await brevoApiRequest('GET', '/contacts/folders?limit=50&offset=0');
  const folders = foldersData.folders || [];
  if (folders.length > 0) {
    const fid = Number(folders[0].id);
    if (!Number.isNaN(fid) && fid > 0) {
      brevoListFolderIdCache = fid;
      return fid;
    }
  }

  const created = await brevoApiRequest('POST', '/contacts/folders', { name: 'Liste questionari' });
  const newId = Number(created.id);
  if (Number.isNaN(newId) || newId <= 0) {
    throw new Error('Brevo: nessuna cartella contatti e creazione cartella fallita. Crea una cartella in Brevo o imposta BREVO_LIST_FOLDER_ID nel .env');
  }
  brevoListFolderIdCache = newId;
  return newId;
}

/** Elenco cartelle contatti Brevo (paginato). */
async function fetchAllBrevoFolders() {
  const out = [];
  const limit = 50;
  let offset = 0;
  for (let page = 0; page < 40; page += 1) {
    const data = await brevoApiRequest('GET', `/contacts/folders?limit=${limit}&offset=${offset}`);
    const chunk = data.folders || [];
    for (const f of chunk) {
      const id = f.id;
      if (id == null) continue;
      out.push({ id: Number(id), name: String(f.name != null ? f.name : '').trim() || `Cartella ${id}` });
    }
    if (chunk.length < limit) break;
    offset += limit;
  }
  return out;
}

function parseOptionalBrevoFolderId(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number(String(raw).trim());
  if (Number.isNaN(n) || n <= 0) return null;
  return n;
}

function normalizeListNameForMatch(name) {
  return String(name || '').trim().toLowerCase();
}

function findCrmListByName(displayName) {
  const n = normalizeListNameForMatch(displayName);
  if (!n) return null;
  const crm = readCrm();
  return crm.lists.find((l) => normalizeListNameForMatch(l.name) === n) || null;
}

async function ensureCrmListByName(displayName) {
  const trimmed = String(displayName || '').trim();
  if (!trimmed) throw new Error('Nome lista richiesto');
  const existing = findCrmListByName(trimmed);
  if (existing) return { id: existing.id, name: existing.name, created: false };
  const crm = readCrm();
  const crmList = { id: genListId(), name: trimmed, createdAt: new Date().toISOString() };
  crm.lists.push(crmList);
  await writeCrm(crm);
  return { id: crmList.id, name: crmList.name, created: true };
}

async function ensureBrevoListByName(displayName, explicitFolderId) {
  const trimmed = String(displayName || '').trim();
  if (!trimmed) throw new Error('Nome lista richiesto');
  const n = normalizeListNameForMatch(trimmed);
  const limit = 50;
  let offset = 0;
  for (let page = 0; page < 40; page += 1) {
    const data = await brevoApiRequest('GET', `/contacts/lists?limit=${limit}&offset=${offset}`);
    const lists = data.lists || [];
    const found = lists.find((l) => normalizeListNameForMatch(l.name) === n);
    if (found) return { id: found.id, name: found.name, created: false };
    if (lists.length < limit) break;
    offset += limit;
  }
  let folderId;
  const folderStr = explicitFolderId != null ? String(explicitFolderId).trim() : '';
  if (folderStr !== '') {
    const parsed = parseOptionalBrevoFolderId(explicitFolderId);
    if (parsed == null) {
      throw new Error('ID cartella Brevo non valido: usa solo un numero intero positivo oppure lascia il campo vuoto per scelta automatica');
    }
    folderId = parsed;
  } else {
    folderId = await getBrevoListFolderId();
  }
  const created = await brevoApiRequest('POST', '/contacts/lists', { name: trimmed, folderId });
  return { id: created.id, name: created.name || trimmed, created: true };
}

/** Cerca per nome (case-insensitive) su Brevo e nel CRM; crea solo ciò che manca. */
async function ensureBrevoAndCrmLists(displayName, options = {}) {
  const brevoName = String(displayName || '').trim();
  if (!brevoName) throw new Error('Nome lista richiesto');
  const crmById = String(options.crmListId != null ? options.crmListId : '').trim();

  let crm;
  if (crmById) {
    const data = readCrm();
    const found = (data.lists || []).find((l) => l.id === crmById);
    if (!found) {
      throw new Error('Lista CRM non trovata: aggiorna l’elenco nel questionario o scegli un’altra lista');
    }
    crm = { id: found.id, name: found.name, created: false };
  } else {
    const crmExplicit = String(options.crmName != null ? options.crmName : '').trim();
    const crmName = crmExplicit || brevoName;
    crm = await ensureCrmListByName(crmName);
  }

  if (!process.env.BREVO_API_KEY || !String(process.env.BREVO_API_KEY).trim()) {
    throw new Error('Brevo non configurato: imposta BREVO_API_KEY sul server');
  }
  const brevo = await ensureBrevoListByName(brevoName, options.folderId);
  return {
    listId: brevo.id,
    crmListId: crm.id,
    listName: brevoName,
    crmListName: crm.name,
    brevoReused: !brevo.created,
    crmReused: !crm.created,
  };
}

async function syncResponseToBrevo(form, response) {
  const bi = form?.brevoIntegration;
  if (!bi?.enabled || bi.listId == null || bi.listId === '' || !process.env.BREVO_API_KEY) return;

  const listId = Number(bi.listId);
  if (Number.isNaN(listId)) return;

  const answers = response?.answers || {};
  const questions = form?.questions || [];
  const attributes = {};

  for (const q of questions) {
    const map = bi.fieldMappings?.[q.id];
    if (!map || !map.enabled) continue;
    const attr = brevoNormAttr(map.attributeName);
    if (!attr) continue;
    const val = answers[q.id];
    if (val == null || val === '') continue;
    attributes[attr] = formatAnswerForBrevo(val);
  }

  let email = '';
  const emailAttr = attributes.EMAIL;
  if (emailAttr && String(emailAttr).includes('@')) email = String(emailAttr).trim();
  if (!email) {
    const parsed = extractContactFromResponse(form, response);
    if (parsed?.email) email = String(parsed.email).trim();
  }
  if (!email || !email.includes('@')) {
    console.warn('[Brevo] sync skipped: no email for response', response?.id);
    return;
  }

  if (bi.syncComputedScore && response.computedScore != null && response.computedScore.value != null) {
    const k = brevoNormAttr(bi.scoreAttributeName) || 'FORM_SCORE';
    attributes[k] = String(response.computedScore.value);
  }

  if (bi.syncMajorityWinner && response.majorityResult) {
    const mr = response.majorityResult;
    const k = brevoNormAttr(bi.majorityAttributeName) || 'FORM_PROFILE';
    /** Solo etichetta A/B/C o PAREGGIO — mai titolo/testo slide. */
    let v = '';
    if (mr.profileLabel != null && String(mr.profileLabel).trim() !== '') v = String(mr.profileLabel).trim();
    else if (mr.tie) v = 'PAREGGIO';
    else if (mr.winner != null && String(mr.winner).trim() !== '') v = String(mr.winner).trim();
    attributes[k] = v;
  }

  if (bi.syncQuizScore && response.quizScore != null) {
    const k = brevoNormAttr(bi.quizScoreAttributeName) || 'QUIZ_SCORE';
    const qs = response.quizScore;
    attributes[k] = typeof qs === 'object' && qs != null && 'correct' in qs ? `${qs.correct}/${qs.total}` : String(qs);
  }

  try {
    await brevoApiRequest('POST', '/contacts', {
      email,
      attributes,
      listIds: [listId],
      updateEnabled: true,
    });
  } catch (e) {
    console.error('[Brevo] sync failed:', e.message, e.detail);
  }
}

/** Iscrive il contatto alla lista CRM locale gemella (stesso criterio email di Brevo). */
async function syncResponseToCrmMirrorList(form, response) {
  const bi = form?.brevoIntegration;
  if (!bi?.enabled || !bi.crmListId) return;
  const parsed = extractContactFromResponse(form, response);
  if (!parsed?.email || !String(parsed.email).includes('@')) return;

  const crm = readCrm();
  if (!crm.lists.some((l) => l.id === bi.crmListId)) {
    console.warn('[CRM] lista gemella non trovata:', bi.crmListId);
    return;
  }
  const key = parsed.contactKey;
  if (!Array.isArray(crm.memberships[key])) crm.memberships[key] = [];
  if (!crm.memberships[key].includes(bi.crmListId)) crm.memberships[key].push(bi.crmListId);
  await writeCrm(crm);
}

function genId() {
  return 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

function genListId() {
  return 'l_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function genPipelineId() {
  return 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function genStageId() {
  return 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function genDealId() {
  return 'd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

function extractContactFromResponse(form, response) {
  const answers = response?.answers || {};
  const questions = form?.questions || [];
  const answerEntries = Object.entries(answers).filter(([, value]) => value != null && String(value).trim() !== '');
  if (answerEntries.length === 0) return null;

  let email = '';
  let phone = '';
  let name = '';
  let company = '';

  for (const q of questions) {
    const raw = answers[q.id];
    if (raw == null || String(raw).trim() === '') continue;
    const value = String(raw).trim();
    const text = String(q.text || '').toLowerCase();
    if (!email && (q.type === 'email' || text.includes('email') || text.includes('e-mail')) && value.includes('@')) email = value;
    if (!phone && (text.includes('telefono') || text.includes('phone') || text.includes('cell'))) phone = value;
    if (!company && (text.includes('azienda') || text.includes('company') || text.includes('impresa'))) company = value;
    if (!name && (text.includes('nome') || text.includes('name'))) name = value;
  }

  if (!email) {
    const hit = answerEntries.find(([, v]) => String(v).includes('@'));
    if (hit) email = String(hit[1]).trim();
  }
  if (!name) {
    const hit = answerEntries.find(([qid]) => {
      const q = questions.find((x) => x.id === qid);
      return q && q.type === 'short';
    });
    if (hit) name = String(hit[1]).trim();
  }

  const contactKey = email ? `email:${email.toLowerCase()}` : `response:${form.id}:${response.id || response.date}`;
  return {
    contactKey,
    email: email || null,
    name: name || null,
    phone: phone || null,
    company: company || null,
    formId: form.id,
    formTitle: form.title || 'Form',
    responseId: response.id || null,
    date: response.date || null,
  };
}

function computeCrmContacts(forms, responses, crm) {
  const byKey = {};
  const memberships = crm?.memberships || {};
  forms.forEach((form) => {
    const list = responses[form.id] || [];
    list.forEach((response) => {
      const parsed = extractContactFromResponse(form, response);
      if (!parsed) return;
      const prev = byKey[parsed.contactKey] || {
        contactKey: parsed.contactKey,
        email: null,
        name: null,
        phone: null,
        company: null,
        firstSeen: parsed.date,
        lastSeen: parsed.date,
        formsCount: 0,
        submissionsCount: 0,
        forms: {},
        _majLabelAt: null,
        majorityLabel: null,
      };
      prev.email = prev.email || parsed.email;
      prev.name = prev.name || parsed.name;
      prev.phone = prev.phone || parsed.phone;
      prev.company = prev.company || parsed.company;
      prev.submissionsCount += 1;
      const mr = response.majorityResult;
      if (mr && !mr.empty) {
        let lab = null;
        if (mr.profileLabel != null && String(mr.profileLabel).trim() !== '') lab = String(mr.profileLabel).trim();
        else if (mr.tie) lab = 'PAREGGIO';
        else if (mr.winner) lab = String(mr.winner);
        if (lab) {
          const d = String(parsed.date || response.date || '');
          if (!prev._majLabelAt || d >= String(prev._majLabelAt)) {
            prev._majLabelAt = d;
            prev.majorityLabel = lab;
          }
        }
      }
      if (!prev.forms[parsed.formId]) {
        prev.forms[parsed.formId] = { formId: parsed.formId, formTitle: parsed.formTitle, count: 0, lastDate: parsed.date };
        prev.formsCount += 1;
      }
      prev.forms[parsed.formId].count += 1;
      prev.forms[parsed.formId].lastDate = parsed.date || prev.forms[parsed.formId].lastDate;
      if (parsed.date && (!prev.lastSeen || parsed.date > prev.lastSeen)) prev.lastSeen = parsed.date;
      if (parsed.date && (!prev.firstSeen || parsed.date < prev.firstSeen)) prev.firstSeen = parsed.date;
      byKey[parsed.contactKey] = prev;
    });
  });

  return Object.values(byKey).map((c) => {
    const { _majLabelAt, ...rest } = c;
    return {
      ...rest,
      forms: Object.values(c.forms).sort((a, b) => String(b.lastDate || '').localeCompare(String(a.lastDate || ''))),
      listIds: Array.isArray(memberships[c.contactKey]) ? memberships[c.contactKey] : [],
    };
  }).sort((a, b) => String(b.lastSeen || '').localeCompare(String(a.lastSeen || '')));
}

// Valuta condizione: answers[questionId] op value
function evalCondition(condition, answers) {
  const { questionId, op, value } = condition || {};
  const actual = answers[questionId];
  if (actual == null || actual === '') return false;
  const str = String(actual).trim();
  const val = String(value ?? '').trim();
  const numActual = Number(actual);
  const numVal = Number(value);
  switch (op) {
    case 'equals': return str === val;
    case 'not_equals': return str !== val;
    case 'contains': return str.toLowerCase().includes((val || '').toLowerCase());
    case 'greater': return !Number.isNaN(numActual) && !Number.isNaN(numVal) && numActual > numVal;
    case 'less': return !Number.isNaN(numActual) && !Number.isNaN(numVal) && numActual < numVal;
    default: return str === val;
  }
}

function runAutomations(form, responseId, response, responses) {
  const automations = form.automations || [];
  let updated = { ...response };
  for (const auto of automations) {
    if (auto.trigger !== 'submit') continue;
    const conditions = auto.conditions || [];
    const allMatch = conditions.length === 0 || conditions.every((c) => evalCondition(c, response.answers));
    if (!allMatch) continue;
    const actions = auto.actions || [];
    for (const action of actions) {
      if (action.type === 'set_stage' && action.stage) {
        updated.stage = action.stage;
      }
      if (action.type === 'webhook' && action.url) {
        const url = action.url.trim();
        if (url.startsWith('http')) {
          const payload = JSON.stringify({
            formId: form.id,
            formTitle: form.title,
            responseId: updated.id,
            date: updated.date,
            answers: updated.answers,
            quizScore: updated.quizScore,
            stage: updated.stage,
          });
          const lib = url.startsWith('https') ? https : http;
          try {
            const u = new URL(url);
            const req = lib.request({
              hostname: u.hostname,
              port: u.port || (u.protocol === 'https:' ? 443 : 80),
              path: u.pathname + u.search,
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
            }, () => {});
            req.on('error', () => {});
            req.write(payload);
            req.end();
          } catch (_) {}
        }
      }
    }
  }
  return updated;
}

// API — /api/forms anche su Vercel: api/form.js (+ vercel.json rewrite)
app.use(
  '/api/forms',
  createFormsRouter(express, {
    readForms,
    writeForms,
    readResponses,
    writeResponses,
    DEFAULT_STAGES,
    genId,
    runAutomations,
    syncResponseToBrevo,
    syncResponseToCrmMirrorList,
  })
);

app.get('/api/crm/lists', (req, res) => {
  const crm = readCrm();
  res.json(crm.lists);
});

app.post('/api/crm/lists', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nome lista richiesto' });
  const crm = readCrm();
  const list = { id: genListId(), name, createdAt: new Date().toISOString() };
  crm.lists.push(list);
  await writeCrm(crm);
  res.status(201).json(list);
});

app.patch('/api/crm/lists/:id', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nome lista richiesto' });
  const crm = readCrm();
  const idx = crm.lists.findIndex((l) => l.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Lista non trovata' });
  crm.lists[idx].name = name;
  await writeCrm(crm);
  res.json(crm.lists[idx]);
});

app.delete('/api/crm/lists/:id', async (req, res) => {
  const crm = readCrm();
  crm.lists = crm.lists.filter((l) => l.id !== req.params.id);
  Object.keys(crm.memberships || {}).forEach((contactKey) => {
    const next = (crm.memberships[contactKey] || []).filter((id) => id !== req.params.id);
    if (next.length === 0) delete crm.memberships[contactKey];
    else crm.memberships[contactKey] = next;
  });
  await writeCrm(crm);
  res.status(204).send();
});

app.post('/api/crm/lists/:id/contacts', async (req, res) => {
  const listId = req.params.id;
  const contactKey = String(req.body?.contactKey || '');
  if (!contactKey) return res.status(400).json({ error: 'contactKey richiesto' });
  const crm = readCrm();
  if (!crm.lists.some((l) => l.id === listId)) return res.status(404).json({ error: 'Lista non trovata' });
  if (!Array.isArray(crm.memberships[contactKey])) crm.memberships[contactKey] = [];
  if (!crm.memberships[contactKey].includes(listId)) crm.memberships[contactKey].push(listId);
  await writeCrm(crm);
  res.status(201).json({ ok: true });
});

app.delete('/api/crm/lists/:id/contacts/:contactKey', async (req, res) => {
  const listId = req.params.id;
  const contactKey = decodeURIComponent(req.params.contactKey);
  const crm = readCrm();
  const current = crm.memberships[contactKey] || [];
  const next = current.filter((id) => id !== listId);
  if (next.length === 0) delete crm.memberships[contactKey];
  else crm.memberships[contactKey] = next;
  await writeCrm(crm);
  res.status(204).send();
});

app.get('/api/crm/contacts', (req, res) => {
  const forms = readForms();
  const responses = readResponses();
  const crm = readCrm();
  res.json(computeCrmContacts(forms, responses, crm));
});

/** Rimuove tutte le compilazioni che aggregano questo contatto, le iscrizioni alle liste e i deal collegati. */
app.delete('/api/crm/contacts/:contactKey', async (req, res) => {
  const contactKey = decodeURIComponent(req.params.contactKey);
  if (!contactKey) return res.status(400).json({ error: 'contactKey richiesto' });
  const forms = readForms();
  const responses = readResponses();
  let removed = 0;
  forms.forEach((form) => {
    const fid = form.id;
    const list = responses[fid] || [];
    const next = list.filter((r) => {
      const parsed = extractContactFromResponse(form, r);
      return !parsed || parsed.contactKey !== contactKey;
    });
    removed += list.length - next.length;
    if (next.length === 0) delete responses[fid];
    else responses[fid] = next;
  });
  const crm = readCrm();
  delete crm.memberships[contactKey];
  crm.deals = (crm.deals || []).filter((d) => d.contactKey !== contactKey);
  await writeCrm(crm);
  await writeResponses(responses);
  res.json({ ok: true, removedResponses: removed });
});

app.get('/api/deals/pipelines', (req, res) => {
  const crm = readCrm();
  res.json(crm.dealPipelines || []);
});

app.post('/api/deals/pipelines', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nome pipeline richiesto' });
  const crm = readCrm();
  const now = new Date().toISOString();
  const pipeline = {
    id: genPipelineId(),
    name,
    createdAt: now,
    stages: [
      { id: genStageId(), name: 'Nuovo' },
      { id: genStageId(), name: 'In trattativa' },
      { id: genStageId(), name: 'Vinto' },
      { id: genStageId(), name: 'Perso' },
    ],
  };
  crm.dealPipelines.push(pipeline);
  await writeCrm(crm);
  res.status(201).json(pipeline);
});

app.patch('/api/deals/pipelines/:id', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nome pipeline richiesto' });
  const crm = readCrm();
  const idx = crm.dealPipelines.findIndex((p) => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Pipeline non trovata' });
  crm.dealPipelines[idx].name = name;
  await writeCrm(crm);
  res.json(crm.dealPipelines[idx]);
});

app.delete('/api/deals/pipelines/:id', async (req, res) => {
  const crm = readCrm();
  crm.dealPipelines = crm.dealPipelines.filter((p) => p.id !== req.params.id);
  crm.deals = (crm.deals || []).filter((d) => d.pipelineId !== req.params.id);
  await writeCrm(crm);
  res.status(204).send();
});

app.post('/api/deals/pipelines/:id/stages', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nome stage richiesto' });
  const crm = readCrm();
  const idx = crm.dealPipelines.findIndex((p) => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Pipeline non trovata' });
  const stage = { id: genStageId(), name };
  crm.dealPipelines[idx].stages = [...(crm.dealPipelines[idx].stages || []), stage];
  await writeCrm(crm);
  res.status(201).json(stage);
});

app.patch('/api/deals/pipelines/:id/stages/:stageId', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nome stage richiesto' });
  const crm = readCrm();
  const pIdx = crm.dealPipelines.findIndex((p) => p.id === req.params.id);
  if (pIdx < 0) return res.status(404).json({ error: 'Pipeline non trovata' });
  const sIdx = (crm.dealPipelines[pIdx].stages || []).findIndex((s) => s.id === req.params.stageId);
  if (sIdx < 0) return res.status(404).json({ error: 'Stage non trovato' });
  crm.dealPipelines[pIdx].stages[sIdx].name = name;
  await writeCrm(crm);
  res.json(crm.dealPipelines[pIdx].stages[sIdx]);
});

app.delete('/api/deals/pipelines/:id/stages/:stageId', async (req, res) => {
  const crm = readCrm();
  const pIdx = crm.dealPipelines.findIndex((p) => p.id === req.params.id);
  if (pIdx < 0) return res.status(404).json({ error: 'Pipeline non trovata' });
  const pipeline = crm.dealPipelines[pIdx];
  const stages = pipeline.stages || [];
  if (stages.length <= 1) return res.status(400).json({ error: 'Serve almeno uno stage' });
  const nextStages = stages.filter((s) => s.id !== req.params.stageId);
  if (nextStages.length === stages.length) return res.status(404).json({ error: 'Stage non trovato' });
  const fallbackStageId = nextStages[0].id;
  crm.dealPipelines[pIdx].stages = nextStages;
  crm.deals = (crm.deals || []).map((d) => {
    if (d.pipelineId === req.params.id && d.stageId === req.params.stageId) return { ...d, stageId: fallbackStageId, updatedAt: new Date().toISOString() };
    return d;
  });
  await writeCrm(crm);
  res.status(204).send();
});

app.get('/api/deals', (req, res) => {
  const crm = readCrm();
  const pipelineId = String(req.query?.pipelineId || '');
  const deals = pipelineId ? (crm.deals || []).filter((d) => d.pipelineId === pipelineId) : (crm.deals || []);
  res.json(deals);
});

app.post('/api/deals', async (req, res) => {
  const pipelineId = String(req.body?.pipelineId || '');
  const stageId = String(req.body?.stageId || '');
  const contactKey = String(req.body?.contactKey || '');
  const title = String(req.body?.title || '').trim();
  const valueRaw = req.body?.value;
  if (!pipelineId || !stageId || !contactKey) return res.status(400).json({ error: 'pipelineId, stageId, contactKey richiesti' });
  const crm = readCrm();
  const pipeline = (crm.dealPipelines || []).find((p) => p.id === pipelineId);
  if (!pipeline) return res.status(404).json({ error: 'Pipeline non trovata' });
  if (!(pipeline.stages || []).some((s) => s.id === stageId)) return res.status(400).json({ error: 'Stage non valido' });
  const now = new Date().toISOString();
  const valueNum = Number(valueRaw);
  const deal = {
    id: genDealId(),
    pipelineId,
    stageId,
    contactKey,
    title: title || null,
    value: Number.isNaN(valueNum) ? null : valueNum,
    createdAt: now,
    updatedAt: now,
  };
  crm.deals.push(deal);
  await writeCrm(crm);
  res.status(201).json(deal);
});

app.patch('/api/deals/:id', async (req, res) => {
  const crm = readCrm();
  const idx = (crm.deals || []).findIndex((d) => d.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Deal non trovato' });
  const curr = crm.deals[idx];
  const patch = {};
  if (req.body?.stageId != null) patch.stageId = String(req.body.stageId);
  if (req.body?.title != null) patch.title = String(req.body.title).trim() || null;
  if (req.body?.value != null) {
    const n = Number(req.body.value);
    patch.value = Number.isNaN(n) ? null : n;
  }
  if (req.body?.pipelineId != null) patch.pipelineId = String(req.body.pipelineId);
  const next = { ...curr, ...patch, updatedAt: new Date().toISOString() };
  const pipeline = (crm.dealPipelines || []).find((p) => p.id === next.pipelineId);
  if (!pipeline) return res.status(400).json({ error: 'Pipeline non valida' });
  if (!(pipeline.stages || []).some((s) => s.id === next.stageId)) return res.status(400).json({ error: 'Stage non valido' });
  crm.deals[idx] = next;
  await writeCrm(crm);
  res.json(next);
});

app.delete('/api/deals/:id', async (req, res) => {
  const crm = readCrm();
  crm.deals = (crm.deals || []).filter((d) => d.id !== req.params.id);
  await writeCrm(crm);
  res.status(204).send();
});

app.get('/api/brevo/status', (req, res) => {
  const k = process.env.BREVO_API_KEY;
  res.json({ configured: Boolean(k && String(k).trim()) });
});

app.get('/api/brevo/folders', async (req, res) => {
  if (!process.env.BREVO_API_KEY || !String(process.env.BREVO_API_KEY).trim()) {
    return res.status(503).json({ error: 'Brevo non configurato: imposta BREVO_API_KEY sul server' });
  }
  try {
    const folders = await fetchAllBrevoFolders();
    res.json({ folders });
  } catch (e) {
    console.error('[Brevo] GET /contacts/folders', e.message, e.detail || '');
    res.status(e.status && e.status >= 400 && e.status < 600 ? e.status : 500).json({
      error: e.message || 'Errore caricamento cartelle Brevo',
      code: e.detail && e.detail.code,
      detail: e.detail,
    });
  }
});

app.post('/api/brevo/lists/ensure', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nome lista richiesto' });
  const folderId = req.body?.folderId;
  const crmListIdBody = req.body?.crmListId;
  const crmListIdOpt = crmListIdBody != null && String(crmListIdBody).trim() !== '' ? String(crmListIdBody).trim() : undefined;
  const crmNameRaw = req.body?.crmName;
  const crmName =
    !crmListIdOpt && crmNameRaw != null && String(crmNameRaw).trim() !== '' ? String(crmNameRaw).trim() : undefined;
  try {
    const result = await ensureBrevoAndCrmLists(name, { folderId, crmName, crmListId: crmListIdOpt });
    res.json({
      listId: result.listId,
      crmListId: result.crmListId,
      listName: result.listName,
      crmListName: result.crmListName,
      brevoReused: result.brevoReused,
      crmReused: result.crmReused,
    });
  } catch (e) {
    console.error('[Brevo] lists/ensure', e.message, e.detail || '');
    res.status(e.status && e.status >= 400 && e.status < 600 ? e.status : 500).json({
      error: e.message || 'Errore',
      code: e.detail && e.detail.code,
      detail: e.detail,
    });
  }
});

app.post('/api/brevo/lists', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nome lista richiesto' });
  const folderId = req.body?.folderId;
  const crmListIdBody = req.body?.crmListId;
  const crmListIdOpt = crmListIdBody != null && String(crmListIdBody).trim() !== '' ? String(crmListIdBody).trim() : undefined;
  const crmNameRaw = req.body?.crmName;
  const crmName =
    !crmListIdOpt && crmNameRaw != null && String(crmNameRaw).trim() !== '' ? String(crmNameRaw).trim() : undefined;
  try {
    const result = await ensureBrevoAndCrmLists(name, { folderId, crmName, crmListId: crmListIdOpt });
    res.status(201).json({
      id: result.listId,
      name: result.listName,
      crmListId: result.crmListId,
      crmListName: result.crmListName,
      brevoReused: result.brevoReused,
      crmReused: result.crmReused,
    });
  } catch (e) {
    res.status(e.status && e.status >= 400 && e.status < 600 ? e.status : 500).json({
      error: e.message || 'Errore Brevo',
      detail: e.detail,
    });
  }
});

// Link per clienti (prima di static)
app.get('/fill/:id', (req, res) => {
  res.sendFile(path.join(PUBLIC_ROOT, 'index.html'));
});

// File statici per ultimo: così DELETE/POST /api/* non vengono mai “mangiati” da static
app.use(express.static(PUBLIC_ROOT));

module.exports = app;
