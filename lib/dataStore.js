const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const TABLE = 'app_data';
const K = { forms: 'forms', responses: 'responses', crm: 'crm' };

const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'typeform-data')
  : path.join(__dirname, '..', 'data');
const FORMS_FILE = path.join(DATA_DIR, 'forms.json');
const RESPONSES_FILE = path.join(DATA_DIR, 'responses.json');
const CRM_FILE = path.join(DATA_DIR, 'crm.json');

let supabaseSingleton = undefined;

function getSupabase() {
  if (supabaseSingleton !== undefined) return supabaseSingleton;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && String(key || '').trim()) {
    supabaseSingleton = createClient(String(url).trim(), String(key).trim());
  } else {
    supabaseSingleton = null;
  }
  return supabaseSingleton;
}

function useSupabase() {
  return getSupabase() !== null;
}

function emptyCrm() {
  return { lists: [], memberships: {}, dealPipelines: [], deals: [] };
}

function normalizeCrm(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  return {
    lists: Array.isArray(data.lists) ? data.lists : [],
    memberships: data.memberships && typeof data.memberships === 'object' ? data.memberships : {},
    dealPipelines: Array.isArray(data.dealPipelines) ? data.dealPipelines : [],
    deals: Array.isArray(data.deals) ? data.deals : [],
  };
}

function initFsIfNeeded() {
  if (useSupabase()) return;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FORMS_FILE)) fs.writeFileSync(FORMS_FILE, '[]');
  if (!fs.existsSync(RESPONSES_FILE)) fs.writeFileSync(RESPONSES_FILE, '{}');
  if (!fs.existsSync(CRM_FILE)) {
    fs.writeFileSync(CRM_FILE, JSON.stringify(emptyCrm(), null, 2));
  }
}

/** Cache in-memory solo con Supabase (stesso modello dei tre JSON). */
let cache = null;
let loadPromise = null;

async function ensureLoaded() {
  initFsIfNeeded();
  if (!useSupabase()) return;
  if (cache) return;
  if (loadPromise) return await loadPromise;
  loadPromise = (async () => {
    const sb = getSupabase();
    const { data: rows, error } = await sb
      .from(TABLE)
      .select('key, value')
      .in('key', [K.forms, K.responses, K.crm]);
    if (error) throw error;
    const map = {};
    for (const r of rows || []) map[r.key] = r.value;
    cache = {
      forms: Array.isArray(map[K.forms]) ? map[K.forms] : [],
      responses: map[K.responses] && typeof map[K.responses] === 'object' ? map[K.responses] : {},
      crm: normalizeCrm(map[K.crm]),
    };
  })();
  try {
    await loadPromise;
  } finally {
    loadPromise = null;
  }
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function readForms() {
  if (useSupabase()) {
    if (!cache) throw new Error('dataStore: cache non caricata (middleware ensureLoaded?)');
    return clone(cache.forms);
  }
  try {
    return JSON.parse(fs.readFileSync(FORMS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function readResponses() {
  if (useSupabase()) {
    if (!cache) throw new Error('dataStore: cache non caricata');
    return clone(cache.responses);
  }
  try {
    return JSON.parse(fs.readFileSync(RESPONSES_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function readCrm() {
  if (useSupabase()) {
    if (!cache) throw new Error('dataStore: cache non caricata');
    return clone(cache.crm);
  }
  try {
    const data = JSON.parse(fs.readFileSync(CRM_FILE, 'utf8'));
    return normalizeCrm(data);
  } catch {
    return emptyCrm();
  }
}

async function persistKey(key, value) {
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).upsert(
    { key, value, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
  if (error) throw error;
}

async function writeForms(forms) {
  if (useSupabase()) {
    if (!cache) await ensureLoaded();
    cache.forms = clone(forms);
    await persistKey(K.forms, cache.forms);
    return;
  }
  fs.writeFileSync(FORMS_FILE, JSON.stringify(forms, null, 2));
}

async function writeResponses(responses) {
  if (useSupabase()) {
    if (!cache) await ensureLoaded();
    cache.responses = clone(responses);
    await persistKey(K.responses, cache.responses);
    return;
  }
  fs.writeFileSync(RESPONSES_FILE, JSON.stringify(responses, null, 2));
}

async function writeCrm(crm) {
  const normalized = normalizeCrm(crm);
  if (useSupabase()) {
    if (!cache) await ensureLoaded();
    cache.crm = clone(normalized);
    await persistKey(K.crm, cache.crm);
    return;
  }
  fs.writeFileSync(CRM_FILE, JSON.stringify(normalized, null, 2));
}

module.exports = {
  useSupabase,
  ensureLoaded,
  readForms,
  readResponses,
  readCrm,
  writeForms,
  writeResponses,
  writeCrm,
};
