#!/usr/bin/env node
/**
 * Importa data/forms.json, responses.json, crm.json nella tabella app_data su Supabase.
 * Uso (dalla root del progetto):
 *   npm run import-supabase
 * Richiede nel .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Attenzione: sovrascrive le chiavi forms / responses / crm già presenti sul progetto Supabase.
 */
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

const url = String(process.env.SUPABASE_URL || '').trim();
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!url || !key) {
  console.error('Mancano SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY nel file .env (root progetto).');
  process.exit(1);
}

const dataDir = path.join(__dirname, '..', 'data');
const files = {
  forms: path.join(dataDir, 'forms.json'),
  responses: path.join(dataDir, 'responses.json'),
  crm: path.join(dataDir, 'crm.json'),
};

function readJson(file, fallback) {
  if (!fs.existsSync(file)) {
    console.warn('File assente, uso default:', file);
    return fallback;
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function main() {
  const forms = readJson(files.forms, []);
  const responses = readJson(files.responses, {});
  const crmRaw = readJson(files.crm, {});
  const crm = {
    lists: Array.isArray(crmRaw.lists) ? crmRaw.lists : [],
    memberships: crmRaw.memberships && typeof crmRaw.memberships === 'object' ? crmRaw.memberships : {},
    dealPipelines: Array.isArray(crmRaw.dealPipelines) ? crmRaw.dealPipelines : [],
    deals: Array.isArray(crmRaw.deals) ? crmRaw.deals : [],
  };

  if (!Array.isArray(forms)) {
    console.error('forms.json deve essere un array.');
    process.exit(1);
  }
  if (responses == null || typeof responses !== 'object' || Array.isArray(responses)) {
    console.error('responses.json deve essere un oggetto.');
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const now = new Date().toISOString();
  const rows = [
    { key: 'forms', value: forms, updated_at: now },
    { key: 'responses', value: responses, updated_at: now },
    { key: 'crm', value: crm, updated_at: now },
  ];

  for (const row of rows) {
    const { error } = await supabase.from('app_data').upsert(row, { onConflict: 'key' });
    if (error) {
      console.error('Errore su', row.key, ':', error.message, error);
      process.exit(1);
    }
    console.log('OK:', row.key, Array.isArray(row.value) ? `(${row.value.length} elementi)` : '(oggetto)');
  }

  console.log('\nImport completato. Ricarica il sito su Vercel.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
