const QUESTION_TYPES = {
  statement: 'Slide / solo testo',
  short: 'Testo breve',
  long: 'Paragrafo',
  choice: 'Scelta singola (un’opzione)',
  multi_choice: 'Scelta multipla (più opzioni)',
  quiz: 'Quiz (risposta corretta)',
  email: 'Email',
  nps: 'NPS (0-10)',
  scale: 'Scala (es. 1-5)',
  rating: 'Valutazione a stelle',
  date: 'Data',
  number: 'Numero',
};

const QUESTION_CATEGORIES = [
  { id: 'structure', label: 'Struttura', color: '#94a3b8', types: ['statement'] },
  { id: 'contact', label: 'Contatto', color: '#ec4899', types: ['email', 'short', 'number'] },
  { id: 'choice', label: 'Scelta', color: '#8b5cf6', types: ['choice', 'multi_choice', 'quiz'] },
  { id: 'rating', label: 'Valutazione', color: '#22c55e', types: ['nps', 'scale', 'rating'] },
  { id: 'text', label: 'Testo e altro', color: '#3b82f6', types: ['short', 'long', 'date'] },
];

const FORM_TYPES = {
  contact: { id: 'contact', label: 'Form di contatto', desc: 'Raccogli dati base e richiesta iniziale (nome, email, telefono, messaggio).' },
  lead_qualification: { id: 'lead_qualification', label: 'Lead qualification', desc: 'Capire se il lead è in target: budget, urgenza, settore, tipo di bisogno, dimensione business.' },
  quiz: { id: 'quiz', label: 'Quiz', desc: 'Dare un risultato, una classificazione o un profilo (es. tipo di strategia, livello marketing).' },
  survey: { id: 'survey', label: 'Survey', desc: 'Raccogliere opinioni, feedback, ricerca (soddisfazione cliente, analisi bisogni).' },
};

const DEFAULT_DEAL_STAGES = ['Nuovo', 'In trattativa', 'Vinto', 'Perso'];

const STATEMENT_TEXT_ALIGNS = ['left', 'center', 'right', 'justify'];

function getStatementTextAlign(question) {
  const a = question.statementTextAlign;
  if (a && STATEMENT_TEXT_ALIGNS.includes(a)) return a;
  return 'left';
}

const DEFAULT_FORM_SCORING = { enabled: false, mode: 'sum', customExpr: 'sum' };

const DEFAULT_MAJORITY_PROFILE = {
  enabled: false,
  messages: {},
  outcomes: {},
  tieMessage: '',
  tieSlideTitle: '',
  showOutcomeSlide: true,
  showResultOnThankYou: false,
};

const DEFAULT_THANK_YOU_PAGE = {
  title: 'Grazie!',
  message: 'Le tue risposte sono state salvate.',
  showResultSlide: true,
  ctaLabel: '',
  ctaUrl: '',
  ctaNewTab: true,
};

const DEFAULT_FORM_BREVO_INTEGRATION = {
  enabled: false,
  listId: null,
  crmListId: null,
  listName: '',
  brevoFolderId: '',
  fieldMappings: {},
  syncComputedScore: true,
  scoreAttributeName: 'FORM_SCORE',
  syncMajorityWinner: true,
  majorityAttributeName: 'FORM_PROFILE',
  syncQuizScore: false,
  quizScoreAttributeName: 'QUIZ_SCORE',
};

function normalizeBrevoIntegrationForLoad(raw) {
  const base = {
    ...DEFAULT_FORM_BREVO_INTEGRATION,
    fieldMappings: {},
  };
  if (!raw || typeof raw !== 'object') return base;
  const fm = raw.fieldMappings && typeof raw.fieldMappings === 'object' ? { ...raw.fieldMappings } : {};
  return {
    ...base,
    ...raw,
    fieldMappings: fm,
    listId: raw.listId != null && raw.listId !== '' ? Number(raw.listId) || raw.listId : null,
    crmListId: raw.crmListId != null && String(raw.crmListId).trim() !== '' ? String(raw.crmListId).trim() : null,
    brevoFolderId: raw.brevoFolderId != null ? String(raw.brevoFolderId).trim() : '',
  };
}

function suggestBrevoAttribute(question) {
  if (question.type === 'email') return 'EMAIL';
  if (question.type === 'statement') return 'FORM_INTRO';
  const label = (question.text || '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36);
  return (label || 'CAMPO').toUpperCase();
}

function brevoQuestionLabel(q) {
  if (q.type === 'statement') return `Slide: ${q.statementTitle || 'Intro'}`;
  return `${QUESTION_TYPES[q.type] || q.type}: ${q.text || '—'}`;
}

async function readFetchJsonBody(res) {
  const text = await res.text();
  let d = {};
  try {
    d = text ? JSON.parse(text) : {};
  } catch {
    const t = text.trim();
    d = { error: t ? t.slice(0, 280) : `Risposta non JSON (HTTP ${res.status})` };
  }
  return d;
}

function getMajorityOutcomeBody(mp, winnerTag) {
  const o = mp?.outcomes?.[winnerTag];
  if (o && typeof o === 'object' && String(o.text || '').trim()) return String(o.text);
  if (mp?.messages?.[winnerTag] != null) return String(mp.messages[winnerTag]);
  return '';
}

function getMajorityOutcomeTitle(mp, winnerTag) {
  const o = mp?.outcomes?.[winnerTag];
  if (o && typeof o === 'object' && String(o.title || '').trim()) return String(o.title).trim();
  return '';
}

function isMajorityScoringActive(form) {
  return Boolean(form?.majorityProfile?.enabled || form?.scoring?.mode === 'majority');
}

/** Contenuto slide risultato (una schermata dedicata prima del Grazie); null se nulla da mostrare. */
function getMajorityOutcomeSlideContent(form, majorityResult) {
  const mp = form?.majorityProfile || {};
  if (!majorityResult || !isMajorityScoringActive(form)) return null;

  if (majorityResult.tie) {
    const body = (mp.tieMessage || majorityResult.message || '').trim();
    const customTitle = (mp.tieSlideTitle || '').trim();
    const title = customTitle || 'Il tuo risultato';
    if (!body && !customTitle) return null;
    return { title, body };
  }

  if (majorityResult.winner) {
    const w = majorityResult.winner;
    const customTitle = getMajorityOutcomeTitle(mp, w);
    const body = getMajorityOutcomeBody(mp, w).trim() || (majorityResult.message || '').trim();
    if (!body && !customTitle) return null;
    return {
      title: customTitle || `Profilo ${w}`,
      body,
    };
  }

  const body = (majorityResult.message || mp.tieMessage || '').trim();
  if (!body) return null;
  const title = (mp.tieSlideTitle || '').trim() || 'Risultato';
  return { title, body };
}

/** Domande il cui valore numerico entra nel vettore q0, q1, … (ordine nel form). */
function getScoringContributorQuestions(questions) {
  return (questions || []).filter((q) =>
    q.type === 'choice' || q.type === 'multi_choice' || q.type === 'quiz'
    || q.type === 'scale' || q.type === 'nps' || q.type === 'rating',
  );
}

function optionScoreAt(question, optionIndex) {
  const arr = question.optionScores;
  if (!Array.isArray(arr) || optionIndex < 0 || optionIndex >= arr.length) return 0;
  const n = Number(arr[optionIndex]);
  return Number.isFinite(n) ? n : 0;
}

function getQuestionScoreValue(question, answer) {
  if (answer == null || answer === '') return 0;
  if (question.type === 'choice' || question.type === 'quiz') {
    const opts = question.options || [];
    const idx = opts.indexOf(answer);
    return idx < 0 ? 0 : optionScoreAt(question, idx);
  }
  if (question.type === 'multi_choice') {
    const opts = question.options || [];
    const picked = Array.isArray(answer) ? answer : [];
    return picked.reduce((acc, opt) => {
      const idx = opts.indexOf(opt);
      return acc + (idx < 0 ? 0 : optionScoreAt(question, idx));
    }, 0);
  }
  if (question.type === 'scale' || question.type === 'nps' || question.type === 'rating') {
    const n = Number(answer);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function getScoreVector(questions, answers) {
  return getScoringContributorQuestions(questions).map((q) => getQuestionScoreValue(q, answers[q.id]));
}

function syncOptionScoresToLength(scores, targetLen) {
  const s = Array.isArray(scores) ? [...scores] : [];
  while (s.length < targetLen) s.push(0);
  s.length = targetLen;
  return s;
}

function syncOptionProfileTagsToLength(tags, targetLen) {
  const s = Array.isArray(tags) ? [...tags] : [];
  while (s.length < targetLen) s.push('');
  s.length = targetLen;
  return s;
}

/** Etichetta profilo unificata (maiuscolo) per conteggi A/B/C… */
function normalizeProfileTag(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  return t.toUpperCase();
}

function normalizeMajorityProfileForLoad(mp) {
  if (!mp || typeof mp !== 'object') return { ...DEFAULT_MAJORITY_PROFILE, messages: {}, outcomes: {} };
  const messages = { ...(mp.messages || {}) };
  const outcomes = { ...(mp.outcomes || {}) };
  Object.keys(messages).forEach((k) => {
    const tag = normalizeProfileTag(k);
    if (!tag) return;
    if (!outcomes[tag]) outcomes[tag] = { title: '', text: messages[k] || '' };
    else if (!String(outcomes[tag].text || '').trim() && messages[k]) outcomes[tag] = { title: outcomes[tag].title || '', text: messages[k] };
  });
  Object.keys(outcomes).forEach((tag) => {
    const t = normalizeProfileTag(tag);
    if (!t) return;
    const o = outcomes[tag];
    if (messages[t] === undefined && o?.text != null) messages[t] = o.text;
  });
  return {
    ...DEFAULT_MAJORITY_PROFILE,
    ...mp,
    messages,
    outcomes,
    tieSlideTitle: mp.tieSlideTitle || '',
    showOutcomeSlide: mp.showOutcomeSlide !== false,
    showResultOnThankYou: Boolean(mp.showResultOnThankYou),
  };
}

function normalizeThankYouPageForLoad(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_THANK_YOU_PAGE };
  return {
    ...DEFAULT_THANK_YOU_PAGE,
    ...raw,
    title: String(raw.title != null ? raw.title : DEFAULT_THANK_YOU_PAGE.title),
    message: String(raw.message != null ? raw.message : DEFAULT_THANK_YOU_PAGE.message),
    showResultSlide: raw.showResultSlide !== false,
    ctaLabel: String(raw.ctaLabel != null ? raw.ctaLabel : ''),
    ctaUrl: String(raw.ctaUrl != null ? raw.ctaUrl : ''),
    ctaNewTab: raw.ctaNewTab !== false,
  };
}

function fireSlidePixel(url) {
  const raw = String(url || '').trim();
  if (!raw) return false;
  const parseMetaFromSnippet = (input) => {
    const metaUrlMatch = input.match(/https?:\/\/www\.facebook\.com\/tr\?[^"'\s<>]+/i);
    if (metaUrlMatch) {
      try {
        const u = new URL(metaUrlMatch[0]);
        const id = u.searchParams.get('id');
        const ev = u.searchParams.get('ev') || 'PageView';
        if (id) return { id, event: ev };
      } catch {}
    }
    const initMatch = input.match(/fbq\(\s*['"]init['"]\s*,\s*['"](\d+)['"]\s*\)/i);
    if (initMatch && initMatch[1]) {
      const trackMatch = input.match(/fbq\(\s*['"]track(?:Custom)?['"]\s*,\s*['"]([^'"]+)['"]\s*\)/i);
      return { id: initMatch[1], event: trackMatch?.[1] || 'PageView' };
    }
    return null;
  };
  const meta = parseMetaFromSnippet(raw);
  if (meta) {
    const beaconUrl = `https://www.facebook.com/tr?id=${encodeURIComponent(meta.id)}&ev=${encodeURIComponent(meta.event)}&noscript=1`;
    const img = new Image();
    img.referrerPolicy = 'no-referrer-when-downgrade';
    img.src = beaconUrl;
    return true;
  }
  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const img = new Image();
    img.referrerPolicy = 'no-referrer-when-downgrade';
    img.src = parsed.toString();
    return true;
  } catch {
    return false;
  }
}

function collectProfileTagsFromQuestions(questions) {
  const set = new Set();
  (questions || []).forEach((q) => {
    if (q.type !== 'choice' && q.type !== 'quiz' && q.type !== 'multi_choice') return;
    (q.optionProfileTags || []).forEach((t) => {
      const n = normalizeProfileTag(t);
      if (n) set.add(n);
    });
  });
  return [...set].sort();
}

/**
 * Conta quante volte l’utente ha scelto opzioni con ogni etichetta profilo;
 * vince l’etichetta col conteggio più alto (pareggio → messaggio dedicato).
 */
function computeMajorityProfileResult(form, answers) {
  if (!isMajorityScoringActive(form)) return null;
  const mp = form?.majorityProfile || {};
  const counts = {};
  const bump = (q, optionIndex) => {
    const tags = q.optionProfileTags || [];
    const tag = normalizeProfileTag(tags[optionIndex]);
    if (!tag) return;
    counts[tag] = (counts[tag] || 0) + 1;
  };

  (form.questions || []).forEach((q) => {
    const opts = q.options || [];
    if (q.type === 'multi_choice') {
      const picked = Array.isArray(answers[q.id]) ? answers[q.id] : [];
      picked.forEach((opt) => {
        const idx = opts.indexOf(opt);
        if (idx >= 0) bump(q, idx);
      });
      return;
    }
    if (q.type !== 'choice' && q.type !== 'quiz') return;
    const ans = answers[q.id];
    if (ans == null || ans === '') return;
    const idx = opts.indexOf(ans);
    if (idx >= 0) bump(q, idx);
  });

  const entries = Object.entries(counts).filter(([, c]) => c > 0);
  const messages = mp.messages && typeof mp.messages === 'object' ? mp.messages : {};

  if (!entries.length) {
    return {
      winner: null,
      tie: false,
      empty: true,
      counts,
      message: mp.tieMessage || '',
      profileLabel: '',
    };
  }

  entries.sort((a, b) => b[1] - a[1]);
  const maxCount = entries[0][1];
  const leaders = entries.filter(([, c]) => c === maxCount).map(([t]) => t);
  const tie = leaders.length > 1;
  const winner = tie ? null : leaders[0];

  let message = '';
  if (tie) {
    message = mp.tieMessage || '';
  } else {
    message = getMajorityOutcomeBody(mp, winner) || (messages[winner] != null ? messages[winner] : '');
  }

  /** Etichetta inviata a Brevo / CRM: solo A, B, C… o PAREGGIO (mai titolo o testo slide). */
  const profileLabel = tie ? 'PAREGGIO' : (winner != null ? String(winner) : '');

  return {
    winner,
    tie,
    empty: false,
    counts,
    leaders: tie ? leaders : null,
    message: typeof message === 'string' ? message : '',
    profileLabel,
  };
}

function safeEvalCustomScore(expr, values) {
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = values.length ? sum / values.length : 0;
  const max = values.length ? Math.max(...values) : 0;
  const min = values.length ? Math.min(...values) : 0;
  let s = String(expr || '').trim();
  if (!s) return sum;
  const indices = [...values.keys()].sort((a, b) => b - a);
  indices.forEach((i) => {
    s = s.replace(new RegExp(`\\bq${i}\\b`, 'g'), `(${values[i]})`);
  });
  s = s.replace(/\bsum\b/gi, `(${sum})`);
  s = s.replace(/\bavg\b/gi, `(${avg})`);
  s = s.replace(/\bmax\b/gi, `(${max})`);
  s = s.replace(/\bmin\b/gi, `(${min})`);
  s = s.replace(/\s+/g, '');
  if (!/^[\d.+\-*/()]+$/.test(s)) throw new Error('invalid expr');
  return Function(`"use strict"; return (${s})`)();
}

/** Risultato aggregato o null se il punteggio non è attivo sul form. */
function computeAggregatedScore(form, answers) {
  const sc = form?.scoring;
  if (!sc || !sc.enabled) return null;
  if (sc.mode === 'majority') return null;
  const contributors = getScoringContributorQuestions(form.questions);
  const values = getScoreVector(form.questions, answers);
  if (!values.length) {
    return { value: 0, mode: sc.mode, breakdown: [] };
  }
  const breakdown = contributors.map((q, i) => ({
    questionId: q.id,
    label: q.text || (q.type === 'statement' ? (q.statementTitle || 'Slide') : q.id),
    value: values[i],
  }));
  let value;
  try {
    switch (sc.mode) {
      case 'average':
        value = values.reduce((a, b) => a + b, 0) / values.length;
        break;
      case 'max':
        value = Math.max(...values);
        break;
      case 'min':
        value = Math.min(...values);
        break;
      case 'custom':
        value = safeEvalCustomScore(sc.customExpr || 'sum', values);
        break;
      case 'sum':
      default:
        value = values.reduce((a, b) => a + b, 0);
    }
  } catch {
    value = values.reduce((a, b) => a + b, 0);
  }
  if (!Number.isFinite(value)) value = 0;
  return { value, mode: sc.mode, breakdown };
}

function formatComputedScoreValue(value) {
  if (!Number.isFinite(value)) return '0';
  if (Number.isInteger(value)) return String(value);
  const r = Math.round(value * 10000) / 10000;
  return String(r);
}

const STORAGE_FORMS = 'mytypeform_forms';
const STORAGE_RESPONSES = 'mytypeform_responses';
const STORAGE_THEME = 'mytypeform_theme';
const STORAGE_CRM = 'mytypeform_crm';

function getFormsLocal() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_FORMS) || '[]');
  } catch {
    return [];
  }
}

function saveFormsLocal(forms) {
  localStorage.setItem(STORAGE_FORMS, JSON.stringify(forms));
}

function getResponsesLocal() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_RESPONSES) || '{}');
  } catch {
    return {};
  }
}

function saveResponsesLocal(responses) {
  localStorage.setItem(STORAGE_RESPONSES, JSON.stringify(responses));
}

function genLocalResponseId() {
  return 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

function ensureResponseIdsLocal(formId) {
  const all = getResponsesLocal();
  const list = all[formId];
  if (!list || !list.length) return;
  let changed = false;
  const next = list.map((r, i) => {
    if (r.id) return r;
    changed = true;
    return { ...r, id: 'r_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 10) };
  });
  if (changed) {
    all[formId] = next;
    saveResponsesLocal(all);
  }
}

function deleteResponseLocal(formId, responseId) {
  const all = getResponsesLocal();
  const list = all[formId];
  if (!list) return;
  const next = list.filter((r) => r.id !== responseId);
  if (next.length === 0) delete all[formId];
  else all[formId] = next;
  saveResponsesLocal(all);
}

function deleteContactLocal(contactKey, forms) {
  const all = getResponsesLocal();
  (forms || []).forEach((form) => {
    const fid = form.id;
    const list = all[fid] || [];
    const next = list.filter((r) => {
      const parsed = extractContactFromSubmission(form, r);
      return !parsed || parsed.contactKey !== contactKey;
    });
    if (next.length === 0) delete all[fid];
    else all[fid] = next;
  });
  saveResponsesLocal(all);
  const crm = getCrmLocal();
  delete crm.memberships[contactKey];
  crm.deals = (crm.deals || []).filter((d) => d.contactKey !== contactKey);
  saveCrmLocal(crm);
}

function addResponseLocal(formId, answers, quizScore, computedScore, majorityResult) {
  const all = getResponsesLocal();
  if (!all[formId]) all[formId] = [];
  all[formId].push({
    id: genLocalResponseId(),
    date: new Date().toISOString(),
    answers,
    quizScore: quizScore ?? null,
    computedScore: computedScore ?? null,
    majorityResult: majorityResult ?? null,
  });
  saveResponsesLocal(all);
}

function getCrmLocal() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_CRM) || '{}');
    return {
      lists: Array.isArray(data?.lists) ? data.lists : [],
      memberships: data?.memberships && typeof data.memberships === 'object' ? data.memberships : {},
      dealPipelines: Array.isArray(data?.dealPipelines) ? data.dealPipelines : [],
      deals: Array.isArray(data?.deals) ? data.deals : [],
    };
  } catch {
    return { lists: [], memberships: {}, dealPipelines: [], deals: [] };
  }
}

function saveCrmLocal(crm) {
  localStorage.setItem(STORAGE_CRM, JSON.stringify(crm));
}

function extractContactFromSubmission(form, response) {
  const answers = response?.answers || {};
  const questions = form?.questions || [];
  const entries = Object.entries(answers).filter(([, v]) => v != null && String(v).trim() !== '');
  if (!entries.length) return null;
  let email = '';
  let name = '';
  let phone = '';
  let company = '';
  questions.forEach((q) => {
    const raw = answers[q.id];
    if (raw == null || String(raw).trim() === '') return;
    const value = String(raw).trim();
    const label = String(q.text || '').toLowerCase();
    if (!email && (q.type === 'email' || label.includes('email') || label.includes('e-mail')) && value.includes('@')) email = value;
    if (!name && (label.includes('nome') || label.includes('name'))) name = value;
    if (!phone && (label.includes('telefono') || label.includes('phone') || label.includes('cell'))) phone = value;
    if (!company && (label.includes('azienda') || label.includes('company') || label.includes('impresa'))) company = value;
  });
  if (!email) {
    const emailHit = entries.find(([, v]) => String(v).includes('@'));
    if (emailHit) email = String(emailHit[1]).trim();
  }
  if (!name) {
    const nameHit = entries.find(([qid]) => questions.find((q) => q.id === qid)?.type === 'short');
    if (nameHit) name = String(nameHit[1]).trim();
  }
  const contactKey = email ? `email:${email.toLowerCase()}` : `response:${form.id}:${response.id || response.date}`;
  return {
    contactKey,
    email: email || null,
    name: name || null,
    phone: phone || null,
    company: company || null,
    date: response.date || null,
    formId: form.id,
    formTitle: form.title || 'Form',
  };
}

function buildCrmContacts(forms, responsesByForm, crm) {
  const byKey = {};
  forms.forEach((form) => {
    (responsesByForm[form.id] || []).forEach((response) => {
      const parsed = extractContactFromSubmission(form, response);
      if (!parsed) return;
      const curr = byKey[parsed.contactKey] || {
        contactKey: parsed.contactKey,
        email: null,
        name: null,
        phone: null,
        company: null,
        firstSeen: parsed.date,
        lastSeen: parsed.date,
        submissionsCount: 0,
        forms: {},
        _majLabelAt: null,
        majorityLabel: null,
      };
      curr.email = curr.email || parsed.email;
      curr.name = curr.name || parsed.name;
      curr.phone = curr.phone || parsed.phone;
      curr.company = curr.company || parsed.company;
      curr.submissionsCount += 1;
      const mr = response.majorityResult;
      if (mr && !mr.empty) {
        let lab = null;
        if (mr.tie) lab = 'PAREGGIO';
        else if (mr.winner) lab = String(mr.winner);
        if (lab) {
          const d = String(parsed.date || response.date || '');
          if (!curr._majLabelAt || d >= String(curr._majLabelAt)) {
            curr._majLabelAt = d;
            curr.majorityLabel = lab;
          }
        }
      }
      if (!curr.forms[parsed.formId]) curr.forms[parsed.formId] = { formId: parsed.formId, formTitle: parsed.formTitle, count: 0 };
      curr.forms[parsed.formId].count += 1;
      if (parsed.date && (!curr.lastSeen || parsed.date > curr.lastSeen)) curr.lastSeen = parsed.date;
      if (parsed.date && (!curr.firstSeen || parsed.date < curr.firstSeen)) curr.firstSeen = parsed.date;
      byKey[parsed.contactKey] = curr;
    });
  });
  const memberships = crm?.memberships || {};
  return Object.values(byKey)
    .map((c) => {
      const { _majLabelAt, ...rest } = c;
      return {
        ...rest,
        forms: Object.values(c.forms),
        listIds: Array.isArray(memberships[c.contactKey]) ? memberships[c.contactKey] : [],
      };
    })
    .sort((a, b) => String(b.lastSeen || '').localeCompare(String(a.lastSeen || '')));
}

// Link per i clienti (modalità solo compilazione)
function getFillFormIdFromUrl() {
  const m = window.location.pathname.match(/^\/fill\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function getFillUrl(formId) {
  return window.location.origin + '/fill/' + encodeURIComponent(formId);
}

function getTheme() {
  return localStorage.getItem(STORAGE_THEME) || 'dark';
}

function persistTheme(theme) {
  localStorage.setItem(STORAGE_THEME, theme);
  document.documentElement.setAttribute('data-theme', theme);
}

// Applica tema al caricamento
if (typeof document !== 'undefined') {
  persistTheme(getTheme());
}

// --- Logica condizionale (operatori, redirect URL, salto domanda)
function evalLogicRuleMatch(rule, answer, question) {
  const op = rule.op || 'equals';
  const val = rule.value != null ? String(rule.value).trim() : '';
  if (question?.type === 'multi_choice' && Array.isArray(answer)) {
    const selected = answer.map((x) => String(x).trim()).filter(Boolean);
    const joined = selected.join(' ').toLowerCase();
    switch (op) {
      case 'equals': return val !== '' && selected.some((s) => s === val);
      case 'not_equals': return val === '' ? selected.length > 0 : !selected.some((s) => s === val);
      case 'contains': return val !== '' && joined.includes(val.toLowerCase());
      default: return val !== '' && selected.some((s) => s === val);
    }
  }
  const actualStr = answer != null ? String(answer).trim() : '';
  const numActual = Number(answer);
  const numVal = Number(rule.value);
  switch (op) {
    case 'equals': return actualStr === val;
    case 'not_equals': return actualStr !== val && actualStr !== '';
    case 'contains': return val !== '' && actualStr.toLowerCase().includes(val.toLowerCase());
    case 'greater':
      if (!Number.isNaN(numActual) && !Number.isNaN(numVal)) return numActual > numVal;
      return actualStr > val;
    case 'less':
      if (!Number.isNaN(numActual) && !Number.isNaN(numVal)) return numActual < numVal;
      return actualStr < val;
    default: return actualStr === val;
  }
}

/** @returns {{ kind: 'linear', index: number } | { kind: 'end' } | { kind: 'jump', index: number } | { kind: 'redirect', url: string }} */
function getNextStepResult(questions, currentIndex, currentQuestion, answer) {
  const logic = currentQuestion?.logic;
  const hasAnswer = Array.isArray(answer) ? answer.length > 0 : answer != null && answer !== '';
  if (logic && Array.isArray(logic) && logic.length > 0 && hasAnswer) {
    for (const rule of logic) {
      if (!evalLogicRuleMatch(rule, answer, currentQuestion)) continue;
      const url = rule.redirectUrl != null ? String(rule.redirectUrl).trim() : '';
      if (rule.goTo === 'redirect' && url) {
        return { kind: 'redirect', url };
      }
      if (rule.goTo === 'end') return { kind: 'end' };
      const idx = questions.findIndex((q) => q.id === rule.goTo);
      if (idx >= 0) return { kind: 'jump', index: idx };
    }
  }
  const next = currentIndex + 1;
  if (next >= questions.length) return { kind: 'end' };
  return { kind: 'linear', index: next };
}

/** YouTube, Vimeo, Loom, URL diretto .mp4/.webm; altri https → link esterno. */
function parseStatementVideoUrl(raw) {
  const url = raw != null ? String(raw).trim() : '';
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i);
  if (yt) return { kind: 'iframe', embedUrl: 'https://www.youtube-nocookie.com/embed/' + yt[1] };
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vm) return { kind: 'iframe', embedUrl: 'https://player.vimeo.com/video/' + vm[1] };
  const loom = url.match(/loom\.com\/share\/([\w-]+)/i);
  if (loom) return { kind: 'iframe', embedUrl: 'https://www.loom.com/embed/' + loom[1] };
  if (/^https?:\/\/.+\.(mp4|webm|ogg)(\?|#|$)/i.test(url)) return { kind: 'video', src: url };
  if (/^https?:\/\//i.test(url)) return { kind: 'link', href: url };
  return null;
}

/** URL video per qualsiasi tipo di domanda; compatibile con statementVideoUrl sulle slide testo. */
function getQuestionVideoUrl(question) {
  if (!question) return '';
  const qv = question.questionVideoUrl != null ? String(question.questionVideoUrl).trim() : '';
  if (qv) return qv;
  if (question.type === 'statement' && question.statementVideoUrl != null) {
    const s = String(question.statementVideoUrl).trim();
    if (s) return s;
  }
  return '';
}

function patchQuestionVideoField(question, url) {
  const u = url != null ? String(url) : '';
  if (question?.type === 'statement') {
    return { questionVideoUrl: u, statementVideoUrl: u };
  }
  return { questionVideoUrl: u };
}

/** 'vertical' = video a sinistra del testo sotto al titolo (desktop); 'horizontal' = video sotto tutto il blocco testo. Se non impostato: verticale (comportamento precedente). */
function getQuestionVideoOrientation(question) {
  const o = question?.questionVideoOrientation;
  if (o === 'horizontal' || o === 'vertical') return o;
  return 'vertical';
}

function appendAutoplayToEmbedUrl(embedUrl) {
  try {
    const u = new URL(embedUrl);
    const host = u.hostname;
    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      u.searchParams.set('autoplay', '1');
      u.searchParams.set('mute', '1');
      u.searchParams.set('playsinline', '1');
    } else if (host.includes('vimeo.com')) {
      u.searchParams.set('autoplay', '1');
      u.searchParams.set('muted', '1');
    } else if (host.includes('loom.com')) {
      u.searchParams.set('autoplay', 'true');
      u.searchParams.set('muted', 'true');
    }
    return u.toString();
  } catch {
    const sep = embedUrl.includes('?') ? '&' : '?';
    return embedUrl + sep + 'autoplay=1';
  }
}

function StatementVideoBlock({ url, variant, autoplay }) {
  const info = parseStatementVideoUrl(url);
  if (!info) return null;
  const wrapClass = 'statement-video-wrap' + (variant ? ` statement-video-wrap--${variant}` : '');
  if (info.kind === 'iframe') {
    const src = autoplay ? appendAutoplayToEmbedUrl(info.embedUrl) : info.embedUrl;
    return (
      <div className={wrapClass}>
        <iframe
          src={src}
          title="Video descrittivo"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }
  if (info.kind === 'video') {
    return (
      <div className={wrapClass}>
        <video controls playsInline preload="metadata" src={info.src} autoPlay={Boolean(autoplay)} muted={Boolean(autoplay)} />
      </div>
    );
  }
  return (
    <div className="statement-video-fallback">
      <a href={info.href} target="_blank" rel="noopener noreferrer">Apri il video in una nuova scheda</a>
    </div>
  );
}

// --- Components ---

function LoginScreen({ onSuccess, theme, onTheme }) {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const submit = (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email: email.trim(), password }),
    })
      .then(async (r) => {
        let d = {};
        try {
          d = await r.json();
        } catch (_) {}
        if (!r.ok) {
          if (r.status === 404) {
            throw new Error('API di login non trovata. Avvia il backend con npm start (node server.js) dalla cartella del progetto, non solo i file statici.');
          }
          throw new Error(d.error || `Accesso negato (HTTP ${r.status})`);
        }
        onSuccess();
      })
      .catch((err) => setError(err.message || 'Errore di rete'))
      .finally(() => setBusy(false));
  };

  return (
    <div className="app-layout auth-login-layout">
      <div className="auth-login-card">
        <div className="auth-login-header">
          <h1 className="auth-login-title">Simone&apos;s Forms</h1>
          <p className="auth-login-sub">Accedi per gestire i questionari, il CRM e le integrazioni.</p>
        </div>
        <form className="auth-login-form" onSubmit={submit}>
          <label className="auth-login-label">
            Email
            <input
              type="email"
              className="auth-login-input"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="auth-login-label">
            Password
            <input
              type="password"
              className="auth-login-input"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error ? <p className="auth-login-error">{error}</p> : null}
          <button type="submit" className="btn-primary auth-login-submit" disabled={busy}>
            {busy ? 'Accesso…' : 'Accedi'}
          </button>
        </form>
        <div className="auth-login-theme">
          <ThemeSelector theme={theme} onTheme={onTheme} />
        </div>
      </div>
    </div>
  );
}

function App() {
  const [view, setView] = React.useState('dashboard');
  const [forms, setForms] = React.useState([]);
  const [useApi, setUseApi] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [authChecked, setAuthChecked] = React.useState(false);
  const [authenticated, setAuthenticated] = React.useState(false);
  const [editingFormId, setEditingFormId] = React.useState(null);
  const [fillingFormId, setFillingFormId] = React.useState(null);
  const [resultsFormId, setResultsFormId] = React.useState(null);
  const [theme, setThemeState] = React.useState(getTheme());

  const loadForms = React.useCallback(() => {
    setLoading(true);
    return fetch('/api/forms', { credentials: 'same-origin' })
      .then((r) => { if (r.ok) return r.json(); throw new Error(); })
      .then((data) => { setForms(data); setUseApi(true); })
      .catch(() => { setForms(getFormsLocal()); setUseApi(false); })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => {
        const ok = Boolean(d.authenticated);
        setAuthenticated(ok);
        if (!ok) {
          setLoading(false);
          setAuthChecked(true);
          return;
        }
        return loadForms().finally(() => setAuthChecked(true));
      })
      .catch(() => {
        setAuthenticated(false);
        setLoading(false);
        setAuthChecked(true);
      });
  }, [loadForms]);

  const refreshForms = React.useCallback(() => {
    if (useApi) {
      fetch('/api/forms', { credentials: 'same-origin' }).then((r) => r.json()).then(setForms).catch(() => setForms(getFormsLocal()));
    } else {
      setForms(getFormsLocal());
    }
  }, [useApi]);

  const onLoginSuccess = React.useCallback(() => {
    setAuthenticated(true);
    setAuthChecked(true);
    loadForms();
  }, [loadForms]);

  const logout = React.useCallback(() => {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).finally(() => {
      setAuthenticated(false);
      setForms([]);
      setUseApi(false);
      setView('dashboard');
      setEditingFormId(null);
      setFillingFormId(null);
      setResultsFormId(null);
    });
  }, []);

  const saveForm = React.useCallback((form) => {
    if (useApi) {
      return fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(form),
      })
        .then(() => refreshForms());
    }
    const list = getFormsLocal();
    const idx = list.findIndex((f) => f.id === form.id);
    const next = idx >= 0 ? list.map((f) => (f.id === form.id ? form : f)) : [...list, form];
    saveFormsLocal(next);
    refreshForms();
    return Promise.resolve();
  }, [useApi, refreshForms]);

  const addResponseForForm = React.useCallback((formId, answers, quizScore, computedScore, majorityResult) => {
    if (useApi) {
      return fetch('/api/forms/' + encodeURIComponent(formId) + '/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ answers, quizScore, computedScore, majorityResult }),
      });
    }
    addResponseLocal(formId, answers, quizScore, computedScore, majorityResult);
  }, [useApi]);

  const handleTheme = (t) => {
    persistTheme(t);
    setThemeState(t);
  };

  if (!authChecked) {
    return <div className="app-layout" style={{ alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>Caricamento...</div>;
  }
  if (!authenticated) {
    return <LoginScreen onSuccess={onLoginSuccess} theme={theme} onTheme={handleTheme} />;
  }
  if (loading) return <div className="app-layout" style={{ alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>Caricamento...</div>;

  return (
    <div className="app-layout">
      <header className="app-header">
        <h1>Simone's Forms</h1>
        <nav style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <ThemeSelector theme={theme} onTheme={handleTheme} />
          <button
            className={view === 'dashboard' ? 'active' : ''}
            onClick={() => { setView('dashboard'); setEditingFormId(null); setFillingFormId(null); setResultsFormId(null); }}
          >
            I miei form
          </button>
          <button
            className={view === 'crm' ? 'active' : ''}
            onClick={() => { setView('crm'); setEditingFormId(null); setFillingFormId(null); setResultsFormId(null); }}
          >
            CRM
          </button>
          <button
            className={view === 'deals' ? 'active' : ''}
            onClick={() => { setView('deals'); setEditingFormId(null); setFillingFormId(null); setResultsFormId(null); }}
          >
            Deal
          </button>
          <button
            className={view === 'builder' ? 'active' : ''}
            onClick={() => { setView('builder'); setEditingFormId(null); }}
          >
            Nuovo form
          </button>
          <button type="button" className="btn-secondary auth-logout-btn" onClick={logout}>
            Esci
          </button>
        </nav>
      </header>
      <main className="app-main">
        {view === 'dashboard' && (
          <Dashboard
            forms={forms}
            useApi={useApi}
            onRefresh={refreshForms}
            onEdit={(id) => { setEditingFormId(id); setView('builder'); }}
            onFill={(id) => { setFillingFormId(id); setView('fill'); }}
            onResults={(id) => { setResultsFormId(id); setView('results'); }}
            onDelete={(id) => {
              if (!window.confirm('Eliminare questo form? Anche tutte le risposte verranno eliminate.')) return;
              setForms((prev) => prev.filter((f) => f.id !== id));
              if (useApi) {
                fetch('/api/forms/' + encodeURIComponent(id), { method: 'DELETE' })
                  .then((res) => {
                    if (!res.ok) {
                      console.warn('Eliminazione sul server non riuscita:', res.status);
                    }
                  })
                  .catch((err) => console.warn('Eliminazione:', err))
                  .finally(() => refreshForms());
              } else {
                const nextForms = getFormsLocal().filter((f) => f.id !== id);
                saveFormsLocal(nextForms);
                const res = getResponsesLocal();
                delete res[id];
                saveResponsesLocal(res);
              }
            }}
          />
        )}
        {view === 'builder' && (
          <Builder
            formId={editingFormId}
            forms={forms}
            useApi={useApi}
            saveForm={saveForm}
            onSave={refreshForms}
            onBack={() => { setView('dashboard'); setEditingFormId(null); }}
          />
        )}
        {view === 'fill' && fillingFormId && (
          <FillView
            form={forms.find((f) => f.id === fillingFormId)}
            onClose={() => { setView('dashboard'); setFillingFormId(null); }}
            onSubmit={() => { refreshForms(); setView('dashboard'); setFillingFormId(null); }}
            onAddResponse={addResponseForForm}
          />
        )}
        {view === 'results' && resultsFormId && (
          <ResultsView
            form={forms.find((f) => f.id === resultsFormId)}
            useApi={useApi}
            onBack={() => { setView('dashboard'); setResultsFormId(null); }}
          />
        )}
        {view === 'crm' && (
          <CRMView
            forms={forms}
            useApi={useApi}
          />
        )}
        {view === 'deals' && (
          <DealsView
            forms={forms}
            useApi={useApi}
          />
        )}
      </main>
    </div>
  );
}

function ThemeSelector({ theme, onTheme }) {
  const themes = [
    { id: 'dark', label: 'Scuro' },
    { id: 'light', label: 'Chiaro' },
    { id: 'accent', label: 'Accent' },
  ];
  return (
    <select
      value={theme}
      onChange={(e) => onTheme(e.target.value)}
      style={{
        padding: '0.4rem 0.75rem',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        color: 'var(--text)',
        fontFamily: 'var(--font)',
        fontSize: '0.85rem',
        cursor: 'pointer',
      }}
      title="Tema"
    >
      {themes.map((t) => (
        <option key={t.id} value={t.id}>{t.label}</option>
      ))}
    </select>
  );
}

function Dashboard({ forms, useApi, onRefresh, onEdit, onFill, onResults, onDelete }) {
  const [copyOk, setCopyOk] = React.useState(null);

  const handleNewForm = (formType = 'contact') => {
    const id = 'f_' + Date.now();
    const newForm = { id, title: 'Nuovo form', questions: [], formType, thankYouPage: { ...DEFAULT_THANK_YOU_PAGE } };
    if (useApi) {
      fetch('/api/forms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newForm) })
        .then(() => { onRefresh(); onEdit(id); });
    } else {
      const next = [...getFormsLocal(), newForm];
      saveFormsLocal(next);
      onRefresh();
      onEdit(id);
    }
  };

  const copyFillLink = (formId, e) => {
    e.stopPropagation();
    const url = getFillUrl(formId);
    navigator.clipboard.writeText(url).then(() => { setCopyOk(formId); setTimeout(() => setCopyOk(null), 2000); });
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h2 style={{ fontSize: '1.5rem' }}>I miei form</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Nuovo:</span>
          {Object.values(FORM_TYPES).map((ft) => (
            <button key={ft.id} type="button" className="btn-secondary" style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }} onClick={() => handleNewForm(ft.id)}>+ {ft.label}</button>
          ))}
        </div>
      </div>
      {useApi && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Condividi il link <strong>Compila (clienti)</strong> con i tuoi clienti: potranno compilare il form e le risposte arriveranno qui.
        </p>
      )}
      {forms.length === 0 ? (
        <div className="empty-state">
          <p>Nessun form ancora. Scegli il tipo e creane uno.</p>
          {Object.values(FORM_TYPES).map((ft) => (
            <button key={ft.id} type="button" className="btn-primary" style={{ margin: '0.25rem' }} onClick={() => handleNewForm(ft.id)}>+ {ft.label}</button>
          ))}
        </div>
      ) : (
        <div className="forms-grid">
          {forms.map((form) => (
            <div key={form.id} className="form-card">
              <div className="form-card-top-actions">
                <button
                  type="button"
                  className="form-card-icon-btn form-card-icon-edit"
                  onClick={(e) => { e.stopPropagation(); onEdit(form.id); }}
                  title="Modifica form"
                  aria-label="Modifica form"
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="form-card-icon-btn form-card-icon-delete"
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); onDelete(form.id); }}
                  title="Elimina form"
                  aria-label="Elimina form"
                >
                  ×
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <h3>{form.title || 'Senza titolo'}</h3>
                <span className="form-type-badge" title={FORM_TYPES[form.formType]?.desc}>{FORM_TYPES[form.formType]?.label || form.formType || 'Form'}</span>
              </div>
              <p>{form.questions?.length || 0} domande</p>
              <div className="form-card-actions">
                <button className="btn-fill" onClick={() => onFill(form.id)}>Compila</button>
                {useApi && (
                  <button className="btn-link" onClick={(e) => copyFillLink(form.id, e)} title="Copia link per i clienti">
                    {copyOk === form.id ? '✓ Copiato!' : 'Link clienti'}
                  </button>
                )}
                <button className="btn-results" onClick={() => onResults(form.id)}>Risultati</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

const DEFAULT_PIPELINE_STAGES = ['Nuovo', 'Contattato', 'Qualificato', 'Vincitore', 'Perso'];

function patchMajorityOutcome(majorityProfile, tag, patch) {
  const cur = majorityProfile.outcomes?.[tag] || {
    title: '',
    text: majorityProfile.messages?.[tag] || '',
  };
  const next = { title: cur.title || '', text: cur.text || '', ...patch };
  return {
    ...majorityProfile,
    outcomes: { ...(majorityProfile.outcomes || {}), [tag]: next },
    messages: { ...(majorityProfile.messages || {}), [tag]: next.text },
  };
}

function FormScoringPanel({ questions, scoring, onChange, majorityProfile, onMajorityChange }) {
  const contributors = getScoringContributorQuestions(questions);
  const [newProfileTag, setNewProfileTag] = React.useState('');
  const fromOpts = collectProfileTagsFromQuestions(questions);
  const fromMsgs = Object.keys(majorityProfile.messages || {}).map(normalizeProfileTag).filter(Boolean);
  const fromOutcomes = Object.keys(majorityProfile.outcomes || {}).map(normalizeProfileTag).filter(Boolean);
  const knownProfileTags = [...new Set([...fromOpts, ...fromMsgs, ...fromOutcomes])].sort();

  const addProfileTagKey = () => {
    const t = normalizeProfileTag(newProfileTag);
    if (!t) return;
    onMajorityChange(patchMajorityOutcome(majorityProfile, t, { title: '', text: '' }));
    setNewProfileTag('');
  };

  const majorityUiEnabled = Boolean(majorityProfile.enabled || scoring.mode === 'majority');

  return (
    <div className="builder-props builder-scoring-panel">
      <p className="builder-props-help" style={{ marginTop: 0 }}>
        Per i <strong>numeri</strong> usa i pesi <strong>Pts</strong> sulle opzioni e la formula qui sotto. Per <strong>A / B / C</strong> (quale risultato vince in base alle risposte più frequenti) scegli <strong>Maggioranza</strong> nel menu «Formula sul questionario» e configura le etichette <strong>Prof.</strong> sulle opzioni.
      </p>
      <label className="builder-props-checkbox">
        <input
          type="checkbox"
          checked={Boolean(scoring.enabled)}
          onChange={(e) => onChange({ ...scoring, enabled: e.target.checked })}
        />
        Attiva calcolo risultato a fine compilazione
      </label>
      <label className="builder-props-label">Formula sul questionario</label>
      <select
        value={scoring.mode || 'sum'}
        onChange={(e) => {
          const mode = e.target.value;
          if (mode === 'majority') {
            onChange({ ...scoring, mode: 'majority', enabled: true });
            onMajorityChange({ ...majorityProfile, enabled: true });
          } else {
            if (scoring.mode === 'majority' && mode !== 'majority') {
              onMajorityChange({ ...majorityProfile, enabled: false });
            }
            onChange({ ...scoring, mode });
          }
        }}
        className="builder-props-select"
        disabled={!scoring.enabled}
      >
        <option value="sum">Somma dei valori (q0 + q1 + …)</option>
        <option value="average">Media aritmetica</option>
        <option value="max">Massimo (il valore più alto tra le domande)</option>
        <option value="min">Minimo</option>
        <option value="majority">Maggioranza (etichette A, B, C… — vince la più scelta)</option>
        <option value="custom">Personalizzata (espressione)</option>
      </select>
      {scoring.mode === 'majority' && (
        <p className="builder-props-help builder-scoring-majority-hint">
          Si contano le risposte per etichetta <strong>Prof.</strong> (A, B, C, D…). Chi ha il conteggio più alto determina l’esito (su Brevo/CRM solo l’etichetta). Scegli sotto se mostrare la slide intermedia e/o il testo sul «Grazie». Non si usa il punteggio numerico (Pts).
        </p>
      )}
      {scoring.mode === 'custom' && (
        <>
          <label className="builder-props-label">Espressione</label>
          <textarea
            value={scoring.customExpr || ''}
            onChange={(e) => onChange({ ...scoring, customExpr: e.target.value })}
            className="builder-props-textarea"
            rows={3}
            disabled={!scoring.enabled}
            placeholder="es. (q0 + q1 + q2) / 3  oppure  sum  oppure  q0 * 2 + q1"
          />
          <p className="builder-props-help">
            Variabili: <code>q0</code>, <code>q1</code>, … nell’ordine delle domande sotto. Anche <code>sum</code>, <code>avg</code>, <code>max</code>, <code>min</code> (calcolati su tutti i valori). Operatori: + − * / ( ).
          </p>
        </>
      )}
      {scoring.mode !== 'majority' && (
        <>
          <label className="builder-props-label">Domande che contano per q0, q1, …</label>
          <ul className="builder-scoring-contributors">
            {contributors.length === 0 ? (
              <li className="builder-props-help">Aggiungi domande a scelta, scala, NPS o stelle.</li>
            ) : (
              contributors.map((q, i) => (
                <li key={q.id}>
                  <span className="builder-scoring-qidx">q{i}</span>
                  <span>{QUESTION_TYPES[q.type] || q.type}: {q.text || '—'}</span>
                </li>
              ))
            )}
          </ul>
        </>
      )}

      <hr className="builder-scoring-divider" />
      <h4 className="builder-scoring-subtitle">Profilo a maggioranza (A, B, C…)</h4>
      <p className="builder-props-help">
        Nelle domande a scelta, per ogni opzione indica l’<strong>etichetta Profilo</strong> (es. <code>A</code>, <code>B</code>). A fine questionario vince l’etichetta più frequente. Su <strong>Brevo</strong> e nel <strong>CRM</strong> viene salvata solo quell’etichetta (o <code>PAREGGIO</code>), non il titolo né il testo della slide. Sulle schermate per il compilatore puoi mostrare invece titolo e testo che configuri sotto.
      </p>
      <label className="builder-props-checkbox">
        <input
          type="checkbox"
          checked={majorityUiEnabled}
          onChange={(e) => {
            const v = e.target.checked;
            onMajorityChange({ ...majorityProfile, enabled: v });
            if (!v && scoring.mode === 'majority') {
              onChange({ ...scoring, mode: 'sum' });
            }
            if (v && scoring.mode !== 'majority') {
              onChange({ ...scoring, mode: 'majority', enabled: true });
            }
          }}
        />
        Usa il risultato a maggioranza (etichette A, B, C…)
      </label>
      <label className="builder-props-checkbox">
        <input
          type="checkbox"
          checked={majorityProfile.showOutcomeSlide !== false}
          onChange={(e) => onMajorityChange({ ...majorityProfile, showOutcomeSlide: e.target.checked })}
          disabled={!majorityUiEnabled}
        />
        Mostra la <strong>slide intermedia</strong> (titolo e testo) prima del «Grazie»
      </label>
      <label className="builder-props-checkbox">
        <input
          type="checkbox"
          checked={Boolean(majorityProfile.showResultOnThankYou)}
          onChange={(e) => onMajorityChange({ ...majorityProfile, showResultOnThankYou: e.target.checked })}
          disabled={!majorityUiEnabled}
        />
        Mostra <strong>titolo e testo</strong> anche sulla schermata «Grazie» (oltre o al posto della slide intermedia)
      </label>
      <label className="builder-props-label">Slide pareggio — titolo</label>
      <input
        type="text"
        value={majorityProfile.tieSlideTitle || ''}
        onChange={(e) => onMajorityChange({ ...majorityProfile, tieSlideTitle: e.target.value })}
        className="builder-props-input"
        disabled={!majorityUiEnabled}
        placeholder="Es. Risultato"
      />
      <label className="builder-props-label">Slide pareggio — testo</label>
      <textarea
        value={majorityProfile.tieMessage || ''}
        onChange={(e) => onMajorityChange({ ...majorityProfile, tieMessage: e.target.value })}
        className="builder-props-textarea"
        rows={3}
        disabled={!majorityUiEnabled}
        placeholder="Es. Il tuo profilo è misto tra più stili…"
      />
      <label className="builder-props-label">Slide per ogni esito (vince A, vince B, …)</label>
      {knownProfileTags.length === 0 && (
        <p className="builder-props-help">Aggiungi etichette nelle opzioni (colonna Prof.) oppure crea un’etichetta qui sotto.</p>
      )}
      {knownProfileTags.map((tag) => {
        const o = majorityProfile.outcomes?.[tag] || { title: '', text: majorityProfile.messages?.[tag] || '' };
        return (
          <div key={tag} className="builder-majority-msg-row">
            <label className="builder-majority-msg-label">Se vince <strong>{tag}</strong></label>
            <input
              type="text"
              value={o.title || ''}
              onChange={(e) => onMajorityChange(patchMajorityOutcome(majorityProfile, tag, { title: e.target.value }))}
              className="builder-props-input"
              disabled={!majorityUiEnabled}
              placeholder={`Titolo slide (es. Sei un genio!)`}
            />
            <textarea
              value={o.text || ''}
              onChange={(e) => onMajorityChange(patchMajorityOutcome(majorityProfile, tag, { text: e.target.value }))}
              className="builder-props-textarea builder-majority-slide-text"
              rows={4}
              disabled={!majorityUiEnabled}
              placeholder="Testo della slide (sotto il titolo)…"
            />
          </div>
        );
      })}
      <div className="builder-majority-add-tag">
        <input
          type="text"
          value={newProfileTag}
          onChange={(e) => setNewProfileTag(e.target.value)}
          className="builder-props-input"
          placeholder="Nuova etichetta (es. D)"
          maxLength={12}
          disabled={!majorityUiEnabled}
        />
        <button type="button" className="btn-secondary builder-props-btn-sm" onClick={addProfileTagKey} disabled={!majorityUiEnabled}>
          Aggiungi messaggio per etichetta
        </button>
      </div>
    </div>
  );
}

function FormBrevoPanel({ questions, brevoIntegration, onChange, useApi }) {
  const [status, setStatus] = React.useState({ loading: true, configured: false });
  const [brevoFolders, setBrevoFolders] = React.useState([]);
  const [brevoFoldersLoading, setBrevoFoldersLoading] = React.useState(false);
  const [brevoFoldersErr, setBrevoFoldersErr] = React.useState(null);

  React.useEffect(() => {
    if (!useApi) {
      setStatus({ loading: false, configured: false });
      return;
    }
    fetch('/api/brevo/status')
      .then((r) => r.json())
      .then((d) => setStatus({ loading: false, configured: Boolean(d.configured) }))
      .catch(() => setStatus({ loading: false, configured: false }));
  }, [useApi]);

  const loadBrevoFolders = React.useCallback(() => {
    setBrevoFoldersLoading(true);
    setBrevoFoldersErr(null);
    fetch('/api/brevo/folders')
      .then(async (r) => {
        const d = await readFetchJsonBody(r);
        if (!r.ok) {
          if (r.status === 404) {
            throw new Error(
              'API non trovata (404). Avvia il backend con npm start nella cartella del progetto (node server.js sulla porta 3333). '
              + 'Il comando npm run serve-static serve solo file HTML senza /api: per Brevo e CRM serve sempre node server.js.'
            );
          }
          const hint = d.code ? ` [${d.code}]` : '';
          throw new Error((d.error || d.message || `HTTP ${r.status}`) + hint);
        }
        setBrevoFolders(Array.isArray(d.folders) ? d.folders : []);
      })
      .catch((e) => {
        setBrevoFoldersErr(e.message || 'Errore');
        setBrevoFolders([]);
      })
      .finally(() => setBrevoFoldersLoading(false));
  }, []);

  React.useEffect(() => {
    if (!useApi || status.loading || !status.configured) return;
    loadBrevoFolders();
  }, [useApi, status.loading, status.configured, loadBrevoFolders]);

  const patch = (partial) => onChange({ ...brevoIntegration, ...partial });

  const setMapping = (questionId, partial) => {
    const prev = brevoIntegration.fieldMappings?.[questionId] || {};
    patch({
      fieldMappings: {
        ...(brevoIntegration.fieldMappings || {}),
        [questionId]: { enabled: false, attributeName: suggestBrevoAttribute(questions.find((q) => q.id === questionId) || {}), ...prev, ...partial },
      },
    });
  };

  const disabledAll = !useApi || !status.configured;
  const selectedFolderId = String(brevoIntegration.brevoFolderId || '').trim();
  const showSavedFolderFallback = selectedFolderId !== '' && !brevoFolders.some((f) => String(f.id) === selectedFolderId);

  return (
    <div className="builder-props builder-brevo-panel">
      <h4 className="builder-settings-section-title">Brevo (Sendinblue)</h4>
      <p className="builder-props-help" style={{ marginTop: 0 }}>
        Dopo ogni invio, il contatto va in Brevo (con attributi mappati) e, con la stessa logica (email obbligatoria), viene iscritto anche alla <strong>lista gemella nel CRM</strong>. Le liste Brevo + CRM si creano con <strong>Salva e chiudi</strong> (stesso nome = lista riusata). Scegli sotto la <strong>cartella Brevo</strong> dove creare nuove liste, oppure «Automatico» per lasciare decidere al server (<code>.env</code>, prima cartella o cartella «Liste questionari»).
      </p>
      {!useApi && (
        <p className="builder-brevo-warn">L’integrazione Brevo è attiva solo in modalità server (API): i dati locali nel browser non chiamano Brevo.</p>
      )}
      {useApi && status.loading && <p className="builder-props-help">Verifica connessione Brevo…</p>}
      {useApi && !status.loading && !status.configured && (
        <p className="builder-brevo-warn">
          Chiave API non configurata sul server. Imposta la variabile d’ambiente <code>BREVO_API_KEY</code> e riavvia l’app.
        </p>
      )}
      <label className="builder-props-checkbox">
        <input
          type="checkbox"
          checked={Boolean(brevoIntegration.enabled)}
          disabled={disabledAll}
          onChange={(e) => patch({ enabled: e.target.checked })}
        />
        Invia ogni risposta a Brevo e iscrivi alla lista CRM gemella (stessa email)
      </label>

      <label className="builder-props-label">Nome lista (Brevo e CRM)</label>
      <input
        type="text"
        className="builder-props-input"
        disabled={disabledAll}
        value={brevoIntegration.listName || ''}
        onChange={(e) => patch({ listName: e.target.value })}
        placeholder="Es. Lead da questionario X"
      />
      <label className="builder-props-label">ID lista Brevo manuale (prioritario)</label>
      <input
        type="text"
        inputMode="numeric"
        className="builder-props-input"
        disabled={disabledAll}
        value={brevoIntegration.listId != null ? String(brevoIntegration.listId) : ''}
        onChange={(e) => patch({ listId: e.target.value })}
        placeholder="Es. 123"
      />
      <p className="builder-props-help" style={{ marginTop: '-0.25rem' }}>
        Se inserisci questo ID, l’invio va sempre a quella lista (anche se cambi il nome lista).
      </p>
      <div className="builder-brevo-folder-row">
        <label className="builder-props-label" style={{ marginTop: 0 }}>Cartella Brevo (per creare la lista)</label>
        <button
          type="button"
          className="builder-brevo-refresh-folders"
          disabled={disabledAll || brevoFoldersLoading}
          onClick={loadBrevoFolders}
        >
          {brevoFoldersLoading ? 'Carico…' : 'Aggiorna elenco'}
        </button>
      </div>
      <select
        className="builder-props-select"
        disabled={disabledAll || brevoFoldersLoading}
        value={selectedFolderId}
        onChange={(e) => patch({ brevoFolderId: e.target.value })}
      >
        <option value="">Automatico (server / .env / prima cartella)</option>
        {brevoFolders.map((f) => (
          <option key={f.id} value={String(f.id)}>{f.name} — ID {f.id}</option>
        ))}
        {showSavedFolderFallback && (
          <option value={selectedFolderId}>ID salvato {selectedFolderId} (non in elenco)</option>
        )}
      </select>
      <label className="builder-props-label">ID cartella manuale (se l’elenco non si carica)</label>
      <input
        type="text"
        inputMode="numeric"
        className="builder-props-input"
        disabled={disabledAll}
        value={brevoIntegration.brevoFolderId != null ? String(brevoIntegration.brevoFolderId) : ''}
        onChange={(e) => patch({ brevoFolderId: e.target.value })}
        placeholder="Stesso ID scelto nel menu; scrivilo qui se il menu non si popola"
      />
      {brevoFoldersErr && (
        <p className="builder-brevo-msg-err">
          {brevoFoldersErr}
          <span className="builder-brevo-err-hint"> Inserisci l’ID sopra (Brevo → Contatti → Cartelle) e salva le liste.</span>
        </p>
      )}
      {!brevoFoldersErr && !brevoFoldersLoading && status.configured && brevoFolders.length === 0 && useApi && (
        <p className="builder-props-help">Nessuna cartella in Brevo: creane una da Contatti → Liste → Cartelle, poi «Aggiorna elenco».</p>
      )}
      {brevoIntegration.listId != null && brevoIntegration.listId !== '' && (
        <p className="builder-props-help builder-brevo-list-linked">
          Brevo: ID <strong>{brevoIntegration.listId}</strong>
          {brevoIntegration.crmListId ? (
            <> — CRM locale: <strong>{brevoIntegration.crmListId}</strong></>
          ) : null}
        </p>
      )}

      <hr className="builder-scoring-divider" />
      <h4 className="builder-settings-section-title">Campi → attributi Brevo</h4>
      <p className="builder-props-help">Spunta i campi da inviare e il nome attributo in Brevo (maiuscolo consigliato).</p>
      <ul className="builder-brevo-field-list">
        {questions.map((q) => {
          const m = brevoIntegration.fieldMappings?.[q.id] || { enabled: false, attributeName: suggestBrevoAttribute(q) };
          return (
            <li key={q.id} className="builder-brevo-field-row">
              <label className="builder-brevo-field-check">
                <input
                  type="checkbox"
                  disabled={disabledAll || !brevoIntegration.enabled}
                  checked={Boolean(m.enabled)}
                  onChange={(e) => setMapping(q.id, { enabled: e.target.checked, attributeName: m.attributeName || suggestBrevoAttribute(q) })}
                />
                <span className="builder-brevo-field-label">{brevoQuestionLabel(q)}</span>
              </label>
              <input
                type="text"
                className="builder-props-input builder-brevo-attr-input"
                disabled={disabledAll || !brevoIntegration.enabled || !m.enabled}
                value={m.attributeName || ''}
                onChange={(e) => setMapping(q.id, { attributeName: e.target.value })}
                placeholder="ES. FIRSTNAME"
              />
            </li>
          );
        })}
      </ul>

      <hr className="builder-scoring-divider" />
      <h4 className="builder-settings-section-title">Risultati per automazioni</h4>
      <label className="builder-props-checkbox">
        <input
          type="checkbox"
          disabled={disabledAll || !brevoIntegration.enabled}
          checked={Boolean(brevoIntegration.syncComputedScore)}
          onChange={(e) => patch({ syncComputedScore: e.target.checked })}
        />
        Includi risultato formula (numero / espressione)
      </label>
      <label className="builder-props-label">Nome attributo — punteggio calcolato</label>
      <input
        type="text"
        className="builder-props-input"
        disabled={disabledAll || !brevoIntegration.enabled || !brevoIntegration.syncComputedScore}
        value={brevoIntegration.scoreAttributeName || ''}
        onChange={(e) => patch({ scoreAttributeName: e.target.value })}
      />
      <label className="builder-props-checkbox">
        <input
          type="checkbox"
          disabled={disabledAll || !brevoIntegration.enabled}
          checked={Boolean(brevoIntegration.syncMajorityWinner)}
          onChange={(e) => patch({ syncMajorityWinner: e.target.checked })}
        />
        Includi profilo a maggioranza (etichetta vincente o PAREGGIO)
      </label>
      <label className="builder-props-label">Nome attributo — profilo</label>
      <input
        type="text"
        className="builder-props-input"
        disabled={disabledAll || !brevoIntegration.enabled || !brevoIntegration.syncMajorityWinner}
        value={brevoIntegration.majorityAttributeName || ''}
        title="Solo etichetta profilo (A, B, C…) o PAREGGIO"
        onChange={(e) => patch({ majorityAttributeName: e.target.value })}
      />
      <p className="builder-props-help" style={{ marginTop: '-0.25rem' }}>
        Valore inviato: solo l’<strong>etichetta</strong> configurata sulle opzioni (es. <code>A</code>, <code>B</code>) o <code>PAREGGIO</code>. Non vengono inviati titolo né testo della slide risultato.
      </p>
      <label className="builder-props-checkbox">
        <input
          type="checkbox"
          disabled={disabledAll || !brevoIntegration.enabled}
          checked={Boolean(brevoIntegration.syncQuizScore)}
          onChange={(e) => patch({ syncQuizScore: e.target.checked })}
        />
        Includi punteggio quiz (corrette/totali)
      </label>
      <label className="builder-props-label">Nome attributo — quiz</label>
      <input
        type="text"
        className="builder-props-input"
        disabled={disabledAll || !brevoIntegration.enabled || !brevoIntegration.syncQuizScore}
        value={brevoIntegration.quizScoreAttributeName || ''}
        onChange={(e) => patch({ quizScoreAttributeName: e.target.value })}
      />
    </div>
  );
}

function QuestionnaireSettingsModal({
  open,
  onClose,
  onSaveAndClose,
  saveBusy,
  questions,
  scoring,
  onScoringChange,
  majorityProfile,
  onMajorityChange,
  thankYouPage,
  onThankYouPageChange,
  brevoIntegration,
  onBrevoChange,
  useApi,
}) {
  if (!open) return null;
  return (
    <div className="builder-settings-overlay" role="presentation" onClick={onClose}>
      <div
        className="builder-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="builder-settings-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="builder-settings-modal-head">
          <h2 id="builder-settings-modal-title">Impostazioni questionario</h2>
          <button type="button" className="builder-settings-modal-close" onClick={onClose} aria-label="Chiudi">
            ×
          </button>
        </div>
        <div className="builder-settings-modal-body">
          <section className="builder-settings-modal-section">
            <h3 className="builder-settings-section-title">Punteggio e formula</h3>
            <FormScoringPanel
              questions={questions}
              scoring={scoring}
              onChange={onScoringChange}
              majorityProfile={majorityProfile}
              onMajorityChange={onMajorityChange}
            />
          </section>
          <section className="builder-settings-modal-section">
            <h3 className="builder-settings-section-title">Thank-you page</h3>
            <div className="builder-props">
              <p className="builder-props-help" style={{ marginTop: 0 }}>
                Configura la schermata mostrata dopo la compilazione del quiz.
              </p>
              <label className="builder-props-label">Titolo</label>
              <input
                type="text"
                className="builder-props-input"
                value={thankYouPage.title || ''}
                onChange={(e) => onThankYouPageChange({ ...thankYouPage, title: e.target.value })}
                placeholder="Grazie!"
              />
              <label className="builder-props-label">Messaggio</label>
              <textarea
                className="builder-props-textarea"
                rows={4}
                value={thankYouPage.message || ''}
                onChange={(e) => onThankYouPageChange({ ...thankYouPage, message: e.target.value })}
                placeholder="Le tue risposte sono state salvate."
              />
              <label className="builder-props-checkbox">
                <input
                  type="checkbox"
                  checked={thankYouPage.showResultSlide !== false}
                  onChange={(e) => onThankYouPageChange({ ...thankYouPage, showResultSlide: e.target.checked })}
                />
                Mostra la slide risultato finale prima della thank-you page
              </label>
              <label className="builder-props-label">Testo bottone (opzionale)</label>
              <input
                type="text"
                className="builder-props-input"
                value={thankYouPage.ctaLabel || ''}
                onChange={(e) => onThankYouPageChange({ ...thankYouPage, ctaLabel: e.target.value })}
                placeholder="Es. Vai al sito"
              />
              <label className="builder-props-label">Link bottone (opzionale)</label>
              <input
                type="url"
                className="builder-props-input"
                value={thankYouPage.ctaUrl || ''}
                onChange={(e) => onThankYouPageChange({ ...thankYouPage, ctaUrl: e.target.value })}
                placeholder="https://..."
              />
              <label className="builder-props-checkbox">
                <input
                  type="checkbox"
                  checked={Boolean(thankYouPage.ctaNewTab)}
                  onChange={(e) => onThankYouPageChange({ ...thankYouPage, ctaNewTab: e.target.checked })}
                />
                Apri il link in una nuova scheda
              </label>
            </div>
          </section>
          <section className="builder-settings-modal-section">
            <FormBrevoPanel questions={questions} brevoIntegration={brevoIntegration} onChange={onBrevoChange} useApi={useApi} />
          </section>
        </div>
        <div className="builder-settings-modal-foot">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saveBusy}>
            Chiudi senza aggiornare liste
          </button>
          <button type="button" className="btn-primary" onClick={onSaveAndClose} disabled={saveBusy}>
            {saveBusy ? 'Liste in corso…' : 'Salva e chiudi'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Builder({ formId, forms, useApi, saveForm, onSave, onBack }) {
  const existing = formId ? forms.find((f) => f.id === formId) : null;
  const [title, setTitle] = React.useState(existing?.title || '');
  const [questions, setQuestions] = React.useState(existing?.questions?.length ? [...existing.questions] : []);
  const [formType, setFormType] = React.useState(existing?.formType || 'contact');
  const [scoring, setScoring] = React.useState(() => (existing?.scoring && typeof existing.scoring === 'object' ? { ...DEFAULT_FORM_SCORING, ...existing.scoring } : { ...DEFAULT_FORM_SCORING }));
  const [majorityProfile, setMajorityProfile] = React.useState(() => normalizeMajorityProfileForLoad(existing?.majorityProfile));
  const [thankYouPage, setThankYouPage] = React.useState(() => normalizeThankYouPageForLoad(existing?.thankYouPage));
  const [brevoIntegration, setBrevoIntegration] = React.useState(() => normalizeBrevoIntegrationForLoad(existing?.brevoIntegration));
  const [selectedId, setSelectedId] = React.useState(null);
  const [addModalOpen, setAddModalOpen] = React.useState(false);
  const [rightTab, setRightTab] = React.useState('question');
  const [draggedIndex, setDraggedIndex] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewKey, setPreviewKey] = React.useState(0);
  const [questionnaireSettingsOpen, setQuestionnaireSettingsOpen] = React.useState(false);
  const [settingsModalSaveBusy, setSettingsModalSaveBusy] = React.useState(false);

  const handleQuestionnaireModalSave = React.useCallback(async () => {
    if (!useApi) {
      setQuestionnaireSettingsOpen(false);
      return;
    }
    const manualListIdRaw = String(brevoIntegration.listId ?? '').trim();
    if (manualListIdRaw !== '') {
      const manualListId = Number(manualListIdRaw);
      if (Number.isNaN(manualListId) || manualListId <= 0) {
        window.alert('ID lista Brevo non valido: inserisci un numero intero positivo.');
        return;
      }
      setBrevoIntegration((prev) =>
        normalizeBrevoIntegrationForLoad({
          ...prev,
          listId: manualListId,
        })
      );
      setQuestionnaireSettingsOpen(false);
      return;
    }
    const name = String(brevoIntegration.listName || '').trim();
    if (!name) {
      setBrevoIntegration((prev) =>
        normalizeBrevoIntegrationForLoad({
          ...prev,
          listId: null,
        })
      );
      setQuestionnaireSettingsOpen(false);
      return;
    }
    setSettingsModalSaveBusy(true);
    try {
      const folderRaw = String(brevoIntegration.brevoFolderId || '').trim();
      const r = await fetch('/api/brevo/lists/ensure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          ...(folderRaw !== '' ? { folderId: folderRaw } : {}),
        }),
      });
      const data = await readFetchJsonBody(r);
      if (!r.ok) {
        if (r.status === 404) {
          throw new Error(
            'API non trovata (404). Avvia il backend con npm start (node server.js). Solo i file statici (serve-static) non espongono /api/brevo/…'
          );
        }
        const code = data.code ? ` [${data.code}]` : '';
        throw new Error((data.error || data.message || `HTTP ${r.status}`) + code);
      }
      setBrevoIntegration((prev) =>
        normalizeBrevoIntegrationForLoad({
          ...prev,
          listId: data.listId,
          crmListId: data.crmListId != null && String(data.crmListId).trim() !== '' ? String(data.crmListId).trim() : prev.crmListId,
          listName: data.listName || name,
        })
      );
    } catch (e) {
      window.alert(e.message || 'Errore');
      setSettingsModalSaveBusy(false);
      return;
    }
    setSettingsModalSaveBusy(false);
    setQuestionnaireSettingsOpen(false);
  }, [brevoIntegration.listName, brevoIntegration.brevoFolderId, brevoIntegration.listId, useApi]);

  React.useEffect(() => {
    if (existing) {
      setTitle(existing.title || '');
      setQuestions(existing.questions?.length ? [...existing.questions] : []);
      setFormType(existing.formType || 'contact');
      setScoring(existing.scoring && typeof existing.scoring === 'object' ? { ...DEFAULT_FORM_SCORING, ...existing.scoring } : { ...DEFAULT_FORM_SCORING });
      setMajorityProfile(normalizeMajorityProfileForLoad(existing.majorityProfile));
      setThankYouPage(normalizeThankYouPageForLoad(existing.thankYouPage));
      setBrevoIntegration(normalizeBrevoIntegrationForLoad(existing.brevoIntegration));
      setSelectedId((prev) => (existing.questions?.some((q) => q.id === prev) ? prev : existing.questions?.[0]?.id || null));
    } else {
      setTitle('Nuovo form');
      setQuestions([]);
      setFormType('contact');
      setScoring({ ...DEFAULT_FORM_SCORING });
      setMajorityProfile(normalizeMajorityProfileForLoad(null));
      setThankYouPage(normalizeThankYouPageForLoad(null));
      setBrevoIntegration(normalizeBrevoIntegrationForLoad(null));
      setSelectedId(null);
    }
  }, [formId]);

  const addQuestion = (type = 'short') => {
    const base = { id: 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2), type, text: '', questionVideoUrl: '', questionVideoOrientation: 'vertical' };
    if (type === 'choice' || type === 'multi_choice' || type === 'quiz') {
      base.options = ['Opzione 1', 'Opzione 2'];
      if (type === 'quiz') base.correctAnswer = 'Opzione 1';
    }
    if (type === 'scale') {
      base.scaleMin = 1;
      base.scaleMax = 5;
      base.scaleLabelLeft = '';
      base.scaleLabelRight = '';
    }
    if (type === 'rating') base.stars = 5;
    if (type === 'number') {
      base.numberMin = null;
      base.numberMax = null;
    }
    if (type === 'statement') {
      base.statementTitle = 'Titolo';
      base.statementBody = 'Scrivi qui il testo che vuoi mostrare su questa slide. Puoi usare più righe.';
      base.statementVideoUrl = '';
      base.questionVideoUrl = '';
      base.statementTextAlign = 'center';
      base.text = '';
    }
    setQuestions((q) => [...q, base]);
    setSelectedId(base.id);
    setAddModalOpen(false);
  };

  const updateQuestion = (id, patch) => {
    setQuestions((q) => q.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const removeQuestion = (id) => {
    setQuestions((q) => {
      const next = q.filter((x) => x.id !== id);
      setSelectedId(selectedId === id ? (next[0]?.id || null) : selectedId);
      return next;
    });
  };

  const moveQuestion = (fromIndex, toIndex) => {
    if (toIndex < 0 || toIndex >= questions.length) return;
    const next = [...questions];
    const [removed] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, removed);
    setQuestions(next);
    setDraggedIndex(null);
  };

  const moveQuestionUp = (index) => {
    if (index <= 0) return;
    moveQuestion(index, index - 1);
  };

  const moveQuestionDown = (index) => {
    if (index >= questions.length - 1) return;
    moveQuestion(index, index + 1);
  };

  const sidebarLabel = (q) => {
    const raw = q.type === 'statement' ? (q.statementTitle || 'Slide') : (q.text || 'Senza testo');
    const max = q.type === 'statement' ? 40 : 35;
    const s = raw.slice(0, max);
    return raw.length > max ? `${s}…` : s;
  };

  const selected = questions.find((q) => q.id === selectedId);

  React.useEffect(() => {
    if (selected?.type === 'statement' && rightTab === 'logic') setRightTab('question');
  }, [selectedId, selected?.type, rightTab]);

  const save = () => {
    const payload = {
      id: formId || 'f_' + Date.now(),
      title: title || 'Senza titolo',
      questions,
      formType: formType || 'contact',
      scoring,
      majorityProfile,
      thankYouPage,
      brevoIntegration,
    };
    setSaving(true);
    saveForm(payload).then(() => { onSave(); onBack(); }).finally(() => setSaving(false));
  };

  return (
    <div className="builder-wrap">
      <header className="builder-header">
        <button type="button" className="btn-secondary" onClick={onBack}>← Indietro</button>
        <input className="builder-title-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titolo del form" />
        <select value={formType} onChange={(e) => setFormType(e.target.value)} className="builder-form-type-select" title="Tipo di form">
          {Object.values(FORM_TYPES).map((ft) => <option key={ft.id} value={ft.id}>{ft.label}</option>)}
        </select>
        <button
          type="button"
          className="builder-header-gear"
          title="Punteggio, formula e integrazione Brevo"
          aria-label="Impostazioni questionario: punteggio e Brevo"
          onClick={() => setQuestionnaireSettingsOpen(true)}
        >
          ⚙
        </button>
        <button
          type="button"
          className="btn-secondary"
          title={questions.length ? 'Apri anteprima come la vedrà chi compila' : 'Aggiungi almeno una domanda'}
          disabled={!questions.length}
          onClick={() => {
            if (!questions.length) return;
            setPreviewKey((k) => k + 1);
            setPreviewOpen(true);
          }}
        >
          Anteprima
        </button>
        <button type="button" className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</button>
      </header>
      <div className="builder-canvas">
        <aside className="builder-sidebar-left">
          <button type="button" className="builder-add-btn" onClick={() => setAddModalOpen(true)}>+ Aggiungi domanda</button>
          <div className="builder-question-list">
            {questions.map((q, index) => (
              <div
                key={q.id}
                className={'builder-question-item' + (selectedId === q.id ? ' selected' : '') + (draggedIndex === index ? ' dragging' : '')}
                onClick={() => setSelectedId(q.id)}
                draggable
                onDragStart={(e) => { setDraggedIndex(index); e.dataTransfer.setData('text/plain', String(index)); e.dataTransfer.effectAllowed = 'move'; }}
                onDragEnd={() => setDraggedIndex(null)}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                onDrop={(e) => { e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!Number.isNaN(from) && from !== index) moveQuestion(from, index); }}
              >
                <span className="builder-q-drag" title="Trascina per riordinare">⋮⋮</span>
                <span className="builder-q-icon" style={{ background: QUESTION_CATEGORIES.find((c) => c.types.includes(q.type))?.color || 'var(--border)' }}>{index + 1}</span>
                <span className="builder-q-text">{sidebarLabel(q)}</span>
                <span className="builder-q-actions">
                  <button type="button" className="builder-q-move" title="Sposta su" onClick={(e) => { e.stopPropagation(); moveQuestionUp(index); }} disabled={index === 0}>↑</button>
                  <button type="button" className="builder-q-move" title="Sposta giù" onClick={(e) => { e.stopPropagation(); moveQuestionDown(index); }} disabled={index === questions.length - 1}>↓</button>
                  <button type="button" className="builder-q-trash" title="Elimina domanda" onClick={(e) => { e.stopPropagation(); if (window.confirm('Eliminare questa domanda?')) removeQuestion(q.id); }}>×</button>
                </span>
              </div>
            ))}
          </div>
          <button type="button" className="builder-add-btn builder-add-btn-bottom" onClick={() => setAddModalOpen(true)}>+</button>
        </aside>
        <main className="builder-preview">
          {selected ? (
            <div className="builder-preview-inner">
              {(() => {
                const previewVid = getQuestionVideoUrl(selected);
                const previewHasVideo = Boolean(parseStatementVideoUrl(previewVid));
                if (selected.type === 'statement') {
                  const title = <h2 className="builder-preview-title builder-preview-statement-title">{selected.statementTitle || 'Titolo della slide'}</h2>;
                  const body = <div className={`builder-preview-statement-body builder-preview-statement-body--${getStatementTextAlign(selected)}`}>{selected.statementBody || ''}</div>;
                  const ok = <button type="button" className="builder-preview-ok" disabled>OK ↵</button>;
                  if (!previewHasVideo) {
                    return (
                      <div className="builder-preview-statement-wrap">
                        {title}
                        {body}
                        {ok}
                      </div>
                    );
                  }
                  return (
                    <QuestionVideoLayout question={selected} variant="preview" title={title}>
                      <>
                        {body}
                        {ok}
                      </>
                    </QuestionVideoLayout>
                  );
                }
                const idx = questions.findIndex((q) => q.id === selected.id) + 1;
                const titleOnly = <h2 className="builder-preview-title">{idx} → {selected.text || 'La tua domanda qui'}</h2>;
                const block = <PreviewQuestionBlock question={selected} />;
                const ok = <button type="button" className="builder-preview-ok" disabled>OK ↵</button>;
                if (!previewHasVideo) {
                  return (
                    <>
                      {titleOnly}
                      <p className="builder-preview-desc">Descrizione (opzionale)</p>
                      {block}
                      {ok}
                    </>
                  );
                }
                return (
                  <QuestionVideoLayout question={selected} variant="preview" title={titleOnly}>
                    <>
                      <p className="builder-preview-desc">Descrizione (opzionale)</p>
                      {block}
                      {ok}
                    </>
                  </QuestionVideoLayout>
                );
              })()}
            </div>
          ) : (
            <div className="builder-preview-empty">Seleziona una domanda a sinistra o aggiungine una</div>
          )}
        </main>
        <aside className="builder-sidebar-right">
          <div className="builder-right-tabs">
            <button type="button" className={rightTab === 'question' ? 'active' : ''} onClick={() => setRightTab('question')} disabled={!selected}>Domanda</button>
            {selected && selected.type !== 'statement' && (
              <button type="button" className={rightTab === 'logic' ? 'active' : ''} onClick={() => setRightTab('logic')}>Logica</button>
            )}
          </div>
          {rightTab === 'question' && selected && (
            <QuestionPropertiesPanel question={selected} allQuestions={questions} onUpdate={(p) => updateQuestion(selected.id, p)} onRemove={() => removeQuestion(selected.id)} />
          )}
          {rightTab === 'logic' && selected && selected.type !== 'statement' && (
            <div className="builder-logic-panel">
              <LogicEditor question={selected} allQuestions={questions} onUpdate={(p) => updateQuestion(selected.id, p)} />
            </div>
          )}
          {rightTab === 'question' && !selected && (
            <div className="builder-sidebar-empty">Seleziona una domanda per modificarla</div>
          )}
        </aside>
      </div>
      <QuestionnaireSettingsModal
        open={questionnaireSettingsOpen}
        onClose={() => setQuestionnaireSettingsOpen(false)}
        onSaveAndClose={handleQuestionnaireModalSave}
        saveBusy={settingsModalSaveBusy}
        questions={questions}
        scoring={scoring}
        onScoringChange={setScoring}
        majorityProfile={majorityProfile}
        onMajorityChange={setMajorityProfile}
        thankYouPage={thankYouPage}
        onThankYouPageChange={setThankYouPage}
        brevoIntegration={brevoIntegration}
        onBrevoChange={setBrevoIntegration}
        useApi={useApi}
      />
      {addModalOpen && (
        <AddQuestionModal onAdd={addQuestion} onClose={() => setAddModalOpen(false)} />
      )}
      {previewOpen && (
        <div className="builder-preview-overlay" role="dialog" aria-modal="true" aria-label="Anteprima questionario">
          <FillView
            key={previewKey}
            previewMode
            form={{
              id: formId || 'preview_draft',
              title: title || 'Senza titolo',
              questions: questions.map((q) => ({ ...q })),
              formType: formType || 'contact',
              scoring,
              majorityProfile,
              thankYouPage,
              brevoIntegration,
            }}
            onClose={() => setPreviewOpen(false)}
            onSubmit={() => setPreviewOpen(false)}
            onAddResponse={() => {}}
          />
        </div>
      )}
      {useApi && <p className="builder-pipeline-hint">Pipeline separata dal form: la configurazione verra definita in uno step successivo.</p>}
    </div>
  );
}

function AddQuestionModal({ onAdd, onClose }) {
  return (
    <div className="builder-modal-overlay" onClick={onClose}>
      <div className="builder-modal" onClick={(e) => e.stopPropagation()}>
        <div className="builder-modal-header">
          <h3>Aggiungi domanda</h3>
          <button type="button" className="btn-remove" onClick={onClose}>×</button>
        </div>
        <div className="builder-modal-body">
          {QUESTION_CATEGORIES.map((cat) => (
            <div key={cat.id} className="builder-modal-category">
              <h4 style={{ color: cat.color, marginBottom: '0.5rem' }}>{cat.label}</h4>
              <div className="builder-modal-types">
                {cat.types.map((typeId) => (
                  <button key={typeId} type="button" className="builder-modal-type-btn" onClick={() => onAdd(typeId)}>
                    <span className="builder-modal-type-icon" style={{ background: cat.color }}>{typeId === 'quiz' ? 'Q' : typeId === 'choice' ? '1' : typeId === 'multi_choice' ? '+' : typeId.slice(0, 1).toUpperCase()}</span>
                    {QUESTION_TYPES[typeId] || typeId}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PreviewQuestionBlock({ question }) {
  if (question.type === 'statement') {
    const bodyOnly = (
      <div className={`builder-preview-statement-body builder-preview-statement-body--${getStatementTextAlign(question)}`}>{question.statementBody || ''}</div>
    );
    const url = getQuestionVideoUrl(question);
    if (!parseStatementVideoUrl(url)) {
      return <div className="builder-preview-statement-wrap">{bodyOnly}</div>;
    }
    const stTitle = <h2 className="builder-preview-title builder-preview-statement-title">{question.statementTitle || 'Titolo'}</h2>;
    return (
      <QuestionVideoLayout question={question} variant="preview" title={stTitle}>
        {bodyOnly}
      </QuestionVideoLayout>
    );
  }
  if (question.type === 'choice') {
    return (
      <div className="builder-preview-choices builder-preview-choices-radio">
        {(question.options || []).map((opt, i) => (
          <div key={i} className="builder-preview-choice-radio">
            <span className="builder-preview-radio-dot" aria-hidden />
            <span>{opt || `Opzione ${i + 1}`}</span>
          </div>
        ))}
      </div>
    );
  }
  if (question.type === 'multi_choice') {
    return (
      <div className="builder-preview-choices builder-preview-choices-check">
        {(question.options || []).map((opt, i) => (
          <div key={i} className="builder-preview-choice-check">
            <span className="builder-preview-check-box" aria-hidden />
            <span>{opt || `Opzione ${i + 1}`}</span>
          </div>
        ))}
      </div>
    );
  }
  if (question.type === 'quiz') {
    return (
      <div className="builder-preview-choices">
        {(question.options || []).map((opt, i) => (
          <div key={i} className="builder-preview-choice">{opt || `Opzione ${i + 1}`}</div>
        ))}
      </div>
    );
  }
  if (question.type === 'nps') return <div className="builder-preview-nps">0 1 2 3 4 5 6 7 8 9 10</div>;
  if (question.type === 'scale') return <div className="builder-preview-scale">{(question.scaleMin ?? 1)} … {(question.scaleMax ?? 5)}</div>;
  if (question.type === 'rating') return <div className="builder-preview-stars">★ ★ ★ ★ ★</div>;
  if (question.type === 'long') return <textarea className="builder-preview-textarea" placeholder="Scrivi qui..." readOnly />;
  if (question.type === 'date') return <input type="date" className="builder-preview-input" readOnly />;
  return <input type="text" className="builder-preview-input" placeholder="Scrivi qui..." readOnly />;
}

function QuestionPropertiesPanel({ question, allQuestions, onUpdate, onRemove }) {
  const isChoice = question.type === 'choice' || question.type === 'multi_choice' || question.type === 'quiz';
  const isStatement = question.type === 'statement';
  const questionIndex = allQuestions.findIndex((q) => q.id === question.id);
  const prevQuestion = questionIndex > 0 ? allQuestions[questionIndex - 1] : null;
  const canJoinPrevious = questionIndex > 0 && question.type !== 'statement' && prevQuestion?.type !== 'statement';
  return (
    <div className="builder-props">
      <label className="builder-props-label">Tipo</label>
      <select value={question.type} onChange={(e) => {
        const type = e.target.value;
        const base = { ...question, type };
        if (type === 'choice' || type === 'multi_choice' || type === 'quiz') {
          base.options = base.options || ['Opzione 1', 'Opzione 2'];
          if (type === 'quiz') base.correctAnswer = base.options[0];
        }
        if (type === 'scale') { base.scaleMin = 1; base.scaleMax = 5; base.scaleLabelLeft = ''; base.scaleLabelRight = ''; }
        if (type === 'rating') base.stars = 5;
        if (type === 'number') { base.numberMin = null; base.numberMax = null; }
        if (type === 'statement') {
          base.statementTitle = base.statementTitle || 'Titolo';
          base.statementBody = base.statementBody || '';
          const vid = getQuestionVideoUrl(question);
          base.statementVideoUrl = vid;
          base.questionVideoUrl = vid;
          base.statementTextAlign = base.statementTextAlign || 'center';
          base.sameSlideAsPrev = false;
        }
        onUpdate(base);
      }} className="builder-props-select">
        {Object.entries(QUESTION_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {isStatement ? (
        <>
          <label className="builder-props-label">Titolo (slide)</label>
          <input type="text" value={question.statementTitle || ''} onChange={(e) => onUpdate({ statementTitle: e.target.value })} placeholder="Titolo principale" className="builder-props-input" />
          <label className="builder-props-label">Testo / introduzione</label>
          <textarea value={question.statementBody || ''} onChange={(e) => onUpdate({ statementBody: e.target.value })} placeholder="Benvenuto, istruzioni, contesto prima delle domande…" className="builder-props-textarea" rows={8} />
          <label className="builder-props-label">Allineamento testo</label>
          <select
            value={getStatementTextAlign(question)}
            onChange={(e) => onUpdate({ statementTextAlign: e.target.value })}
            className="builder-props-select"
          >
            <option value="left">Sinistra</option>
            <option value="center">Centrato</option>
            <option value="right">Destra</option>
            <option value="justify">Giustificato</option>
          </select>
          <label className="builder-props-label">Video (opzionale)</label>
          <input
            type="url"
            value={getQuestionVideoUrl(question)}
            onChange={(e) => onUpdate(patchQuestionVideoField(question, e.target.value))}
            placeholder="https://youtube.com/watch?v=… o Vimeo, Loom, .mp4"
            className="builder-props-input"
          />
          {parseStatementVideoUrl(getQuestionVideoUrl(question)) && (
            <>
              <label className="builder-props-label">Formato video</label>
              <select
                value={getQuestionVideoOrientation(question)}
                onChange={(e) => onUpdate({ questionVideoOrientation: e.target.value })}
                className="builder-props-select"
              >
                <option value="vertical">Verticale / Short (video a sinistra del testo, sotto al titolo)</option>
                <option value="horizontal">Orizzontale (video sotto titolo e testo)</option>
              </select>
            </>
          )}
          <p className="builder-props-help">YouTube, Vimeo, Loom o .mp4 / .webm. Su mobile il video è sempre sotto il testo; avvio automatico in muto.</p>
        </>
      ) : (
        <>
          <label className="builder-props-label">Domanda</label>
          <input type="text" value={question.text || ''} onChange={(e) => onUpdate({ text: e.target.value })} placeholder="Testo della domanda" className="builder-props-input" />
          <label className="builder-props-checkbox">
            <input
              type="checkbox"
              checked={Boolean(question.sameSlideAsPrev) && canJoinPrevious}
              disabled={!canJoinPrevious}
              onChange={(e) => onUpdate({ sameSlideAsPrev: e.target.checked })}
            />
            Mostra nella stessa slide della precedente
          </label>
          {!canJoinPrevious && (
            <p className="builder-props-help">Disponibile dalla seconda domanda (non per slide di testo).</p>
          )}
          <label className="builder-props-label">Video (opzionale)</label>
          <input
            type="url"
            value={question.questionVideoUrl || ''}
            onChange={(e) => onUpdate({ questionVideoUrl: e.target.value })}
            placeholder="https://youtube.com/watch?v=… o Vimeo, Loom, .mp4"
            className="builder-props-input"
          />
          {parseStatementVideoUrl((question.questionVideoUrl || '').trim()) && (
            <>
              <label className="builder-props-label">Formato video</label>
              <select
                value={getQuestionVideoOrientation(question)}
                onChange={(e) => onUpdate({ questionVideoOrientation: e.target.value })}
                className="builder-props-select"
              >
                <option value="vertical">Verticale / Short (video a sinistra, sotto il titolo)</option>
                <option value="horizontal">Orizzontale (video sotto domanda e opzioni)</option>
              </select>
            </>
          )}
          <p className="builder-props-help">Su mobile il video è sempre sotto il testo; avvio automatico in muto.</p>
        </>
      )}
      <hr className="builder-scoring-divider" />
      <h4 className="builder-settings-section-title">Tracking pixel (slide)</h4>
      <label className="builder-props-label">URL pixel</label>
      <input
        type="url"
        value={question.slidePixelUrl || ''}
        onChange={(e) => onUpdate({ slidePixelUrl: e.target.value })}
        placeholder="https://tracker.example.com/pixel?id=..."
        className="builder-props-input"
      />
      <label className="builder-props-checkbox">
        <input
          type="checkbox"
          checked={question.slidePixelFireOnce !== false}
          onChange={(e) => onUpdate({ slidePixelFireOnce: e.target.checked })}
        />
        Attiva una sola volta per compilazione
      </label>
      <p className="builder-props-help">
        Il pixel parte quando questa slide viene visualizzata in compilazione (non in anteprima builder).
      </p>
      {isChoice && (
        <>
          <label className="builder-props-label">Opzioni</label>
          {(question.options || []).map((opt, i) => (
            <div key={i} className="builder-props-option-row">
              <input type="text" value={opt} onChange={(e) => {
                const opts = (question.options || []).map((o, j) => (j === i ? e.target.value : o));
                const len = opts.length;
                onUpdate({
                  options: opts,
                  optionScores: syncOptionScoresToLength(question.optionScores, len),
                  optionProfileTags: syncOptionProfileTagsToLength(question.optionProfileTags, len),
                });
              }} className="builder-props-input builder-props-option-text" placeholder={`Opzione ${i + 1}`} />
              <label className="builder-props-option-profilo" title="Etichetta per profilo a maggioranza (A, B, C…)">
                <span className="builder-props-option-pts-label">Prof.</span>
                <input
                  type="text"
                  maxLength={12}
                  value={question.optionProfileTags?.[i] != null ? question.optionProfileTags[i] : ''}
                  onChange={(e) => {
                    const opts = question.options || [];
                    const next = syncOptionProfileTagsToLength(question.optionProfileTags, opts.length);
                    next[i] = e.target.value;
                    onUpdate({ optionProfileTags: next });
                  }}
                  placeholder="A"
                />
              </label>
              <label className="builder-props-option-pts">
                <span className="builder-props-option-pts-label">Pts</span>
                <input
                  type="number"
                  step="any"
                  value={question.optionScores?.[i] != null && question.optionScores[i] !== '' ? question.optionScores[i] : 0}
                  onChange={(e) => {
                    const opts = question.options || [];
                    const raw = e.target.value;
                    const n = raw === '' ? 0 : Number(raw);
                    const nextScores = syncOptionScoresToLength(question.optionScores, opts.length);
                    nextScores[i] = Number.isFinite(n) ? n : 0;
                    onUpdate({ optionScores: nextScores });
                  }}
                  title="Peso / punti se l’utente sceglie questa opzione"
                />
              </label>
              {question.type === 'quiz' && <input type="radio" name={'correct-' + question.id} checked={(question.correctAnswer || '') === opt} onChange={() => onUpdate({ correctAnswer: opt })} title="Risposta corretta" />}
            </div>
          ))}
          <button type="button" className="btn-secondary builder-props-btn-sm" onClick={() => {
            const opts = [...(question.options || []), 'Nuova opzione'];
            const len = opts.length;
            onUpdate({
              options: opts,
              optionScores: syncOptionScoresToLength(question.optionScores, len),
              optionProfileTags: syncOptionProfileTagsToLength(question.optionProfileTags, len),
            });
          }}
          >+ Opzione</button>
          {question.type === 'choice' && <p className="builder-props-help">In compilazione si può selezionare una sola opzione (radio).</p>}
          {question.type === 'multi_choice' && <p className="builder-props-help">In compilazione si possono selezionare più opzioni (checkbox). Serve almeno una scelta per andare avanti.</p>}
        </>
      )}
      {question.type === 'scale' && (
        <>
          <label className="builder-props-label">Scala</label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input type="number" value={question.scaleMin ?? 1} onChange={(e) => onUpdate({ scaleMin: parseInt(e.target.value, 10) || 1 })} style={{ width: 56 }} />
            <input type="number" value={question.scaleMax ?? 5} onChange={(e) => onUpdate({ scaleMax: parseInt(e.target.value, 10) || 5 })} style={{ width: 56 }} />
          </div>
        </>
      )}
      {question.type === 'rating' && (
        <><label className="builder-props-label">Stelle</label><input type="number" min={1} max={10} value={question.stars ?? 5} onChange={(e) => onUpdate({ stars: Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 5)) })} style={{ width: 56 }} /></>
      )}
      <button type="button" className="btn-delete builder-props-remove" onClick={() => { if (window.confirm('Eliminare questa domanda?')) onRemove(); }}>Elimina domanda</button>
    </div>
  );
}

function QuestionBlock({ question, allQuestions, onUpdate, onRemove }) {
  const isChoice = question.type === 'choice' || question.type === 'multi_choice' || question.type === 'quiz';
  const isScale = question.type === 'scale';
  const hasLogic = question.type === 'choice' || question.type === 'multi_choice' || question.type === 'quiz' || question.type === 'nps' || question.type === 'scale' || question.type === 'rating';

  return (
    <div className="question-block">
      <span className="drag-handle" title="Trascina">⋮⋮</span>
      <div className="q-body">
        <span className="q-type">{QUESTION_TYPES[question.type] || question.type}</span>
        <input
          value={question.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          placeholder="Scrivi la domanda..."
        />
        {isChoice && (
          <div className="q-options">
            {(question.options || []).map((opt, i) => (
              <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => {
                    const opts = [...(question.options || [])];
                    opts[i] = e.target.value;
                    onUpdate({ options: opts });
                  }}
                  placeholder={`Opzione ${i + 1}`}
                />
                {question.type === 'quiz' && (
                  <input
                    type="radio"
                    name={'correct-' + question.id}
                    checked={(question.correctAnswer || '') === opt}
                    onChange={() => onUpdate({ correctAnswer: opt })}
                    title="Risposta corretta"
                  />
                )}
              </label>
            ))}
            <button type="button" className="btn-secondary" style={{ marginTop: '0.5rem', padding: '0.35rem 0.75rem', fontSize: '0.85rem' }} onClick={() => onUpdate({ options: [...(question.options || []), 'Nuova opzione'] })}>
              + Opzione
            </button>
          </div>
        )}
        {question.type === 'scale' && (
          <div className="q-scale-settings">
            <label>Min <input type="number" value={question.scaleMin ?? 1} onChange={(e) => onUpdate({ scaleMin: parseInt(e.target.value, 10) || 1 })} style={{ width: 60 }} /></label>
            <label>Max <input type="number" value={question.scaleMax ?? 5} onChange={(e) => onUpdate({ scaleMax: parseInt(e.target.value, 10) || 5 })} style={{ width: 60 }} /></label>
            <input type="text" value={question.scaleLabelLeft || ''} onChange={(e) => onUpdate({ scaleLabelLeft: e.target.value })} placeholder="Etichetta sinistra" style={{ width: 140 }} />
            <input type="text" value={question.scaleLabelRight || ''} onChange={(e) => onUpdate({ scaleLabelRight: e.target.value })} placeholder="Etichetta destra" style={{ width: 140 }} />
          </div>
        )}
        {question.type === 'rating' && (
          <div>
            <label>Stelle: <input type="number" min={1} max={10} value={question.stars ?? 5} onChange={(e) => onUpdate({ stars: Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 5)) })} style={{ width: 60 }} /></label>
          </div>
        )}
        {question.type === 'number' && (
          <div className="q-number-settings">
            <label>Min <input type="number" value={question.numberMin ?? ''} onChange={(e) => onUpdate({ numberMin: e.target.value === '' ? null : parseInt(e.target.value, 10) })} style={{ width: 80 }} /></label>
            <label>Max <input type="number" value={question.numberMax ?? ''} onChange={(e) => onUpdate({ numberMax: e.target.value === '' ? null : parseInt(e.target.value, 10) })} style={{ width: 80 }} /></label>
          </div>
        )}
        {hasLogic && (
          <LogicEditor question={question} allQuestions={allQuestions} onUpdate={onUpdate} />
        )}
      </div>
      <button type="button" className="btn-remove" onClick={onRemove} title="Rimuovi">×</button>
    </div>
  );
}

const LOGIC_OPS_CHOICE = [
  { id: 'equals', label: 'è uguale a' },
  { id: 'not_equals', label: 'è diverso da' },
];
const LOGIC_OPS_TEXT = [
  { id: 'equals', label: 'è uguale a' },
  { id: 'not_equals', label: 'è diverso da' },
  { id: 'contains', label: 'contiene' },
];
const LOGIC_OPS_NUMERIC = [
  { id: 'equals', label: 'è uguale a' },
  { id: 'not_equals', label: 'è diverso da' },
  { id: 'greater', label: 'è maggiore di' },
  { id: 'less', label: 'è minore di' },
];

const LOGIC_OPS_MULTI_CHOICE = [
  ...LOGIC_OPS_CHOICE,
  { id: 'contains', label: 'nelle scelte compare (testo)' },
];

function getLogicOpsForType(qType) {
  if (qType === 'multi_choice') return LOGIC_OPS_MULTI_CHOICE;
  if (qType === 'choice' || qType === 'quiz') return LOGIC_OPS_CHOICE;
  if (qType === 'short' || qType === 'long' || qType === 'email') return LOGIC_OPS_TEXT;
  return LOGIC_OPS_NUMERIC;
}

function defaultLogicValue(question) {
  const t = question.type;
  const opts = question.options || [];
  if (t === 'choice' || t === 'multi_choice' || t === 'quiz') return opts[0] || '';
  if (t === 'nps') return '5';
  if (t === 'scale') return String(question.scaleMin || 1);
  if (t === 'rating') return '3';
  if (t === 'number') return '0';
  if (t === 'date') return '';
  return '';
}

function LogicEditor({ question, allQuestions, onUpdate }) {
  const logic = question.logic || [];
  const ops = getLogicOpsForType(question.type);
  const qType = question.type;

  const addRule = () => {
    const firstOp = ops[0]?.id || 'equals';
    onUpdate({ logic: [...logic, { op: firstOp, value: defaultLogicValue(question), goTo: 'end', redirectUrl: '' }] });
  };

  const updateRule = (i, patch) => {
    const next = [...logic];
    next[i] = { ...next[i], ...patch };
    onUpdate({ logic: next });
  };

  const removeRule = (i) => {
    onUpdate({ logic: logic.filter((_, idx) => idx !== i) });
  };

  const renderValueInput = (rule, i) => {
    const val = rule.value != null ? rule.value : '';
    const style = { padding: '0.35rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', minWidth: 100 };
    if (qType === 'choice' || qType === 'multi_choice' || qType === 'quiz') {
      return (
        <select value={val} onChange={(e) => updateRule(i, { value: e.target.value })} style={{ ...style, minWidth: 140 }}>
          {(question.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (qType === 'nps') {
      return (
        <select value={String(val)} onChange={(e) => updateRule(i, { value: e.target.value })} style={style}>
          {Array.from({ length: 11 }, (_, k) => k).map((n) => <option key={n} value={String(n)}>{n}</option>)}
        </select>
      );
    }
    if (qType === 'scale') {
      return (
        <select value={String(val)} onChange={(e) => updateRule(i, { value: e.target.value })} style={style}>
          {Array.from({ length: (question.scaleMax || 5) - (question.scaleMin || 1) + 1 }, (_, k) => (question.scaleMin || 1) + k).map((n) => <option key={n} value={String(n)}>{n}</option>)}
        </select>
      );
    }
    if (qType === 'rating') {
      return (
        <select value={String(val)} onChange={(e) => updateRule(i, { value: e.target.value })} style={style}>
          {Array.from({ length: question.stars || 5 }, (_, k) => k + 1).map((n) => <option key={n} value={String(n)}>{n}</option>)}
        </select>
      );
    }
    if (qType === 'date') {
      return <input type="date" value={val} onChange={(e) => updateRule(i, { value: e.target.value })} style={style} />;
    }
    if (qType === 'number') {
      return <input type="number" value={val} onChange={(e) => updateRule(i, { value: e.target.value })} style={style} placeholder="Valore" />;
    }
    return <input type="text" value={val} onChange={(e) => updateRule(i, { value: e.target.value })} style={{ ...style, minWidth: 140 }} placeholder="Valore / testo" />;
  };

  return (
    <div className="logic-editor">
      <p className="logic-editor-intro">Definisci regole <strong>Se</strong> la risposta soddisfa una condizione, <strong>allora</strong> salta a un’altra domanda, termina il form o reindirizza a un URL.</p>
      {logic.map((rule, i) => {
        const op = rule.op || 'equals';
        const destVal = rule.goTo === 'redirect' ? 'redirect' : rule.goTo;
        return (
          <div key={i} className="logic-rule-card">
            <div className="logic-rule-row">
              <span className="logic-rule-label">Se</span>
              <select value={op} onChange={(e) => updateRule(i, { op: e.target.value })} className="logic-rule-select">
                {ops.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              {renderValueInput(rule, i)}
            </div>
            <div className="logic-rule-row">
              <span className="logic-rule-label">Allora</span>
              <select
                value={destVal}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'redirect') updateRule(i, { goTo: 'redirect', redirectUrl: rule.redirectUrl || 'https://' });
                  else updateRule(i, { goTo: v, redirectUrl: '' });
                }}
                className="logic-rule-select logic-rule-select-wide"
              >
                <option value="end">Fine form</option>
                {allQuestions.filter((q) => q.id !== question.id).map((q) => (
                  <option key={q.id} value={q.id}>Vai a: {(q.text || '').slice(0, 28)}…</option>
                ))}
                <option value="redirect">Reindirizza a URL</option>
              </select>
            </div>
            {rule.goTo === 'redirect' && (
              <div className="logic-rule-row">
                <span className="logic-rule-label">URL</span>
                <input type="url" value={rule.redirectUrl || ''} onChange={(e) => updateRule(i, { redirectUrl: e.target.value })} placeholder="https://..." className="logic-rule-url" />
              </div>
            )}
            <button type="button" className="logic-rule-remove" onClick={() => removeRule(i)}>Elimina regola</button>
          </div>
        );
      })}
      <button type="button" className="btn-secondary logic-add-rule" onClick={addRule}>+ Regola logica</button>
    </div>
  );
}

function isMultiSlideGridCompactType(type) {
  return type === 'short' || type === 'email' || type === 'number' || type === 'date';
}

function FillNextButton({ questions, currentIndex, current, answers, onNext, canNext }) {
  const result = getNextStepResult(questions, currentIndex, current, answers[current?.id]);
  const isLast = result.kind === 'end' || result.kind === 'redirect';
  const label = result.kind === 'redirect' ? 'Vai al link' : isLast ? 'Invia' : 'Avanti';
  return (
    <button type="button" className="typeform-next" onClick={onNext} disabled={!canNext()}>
      {label}
    </button>
  );
}

/** Verticale: titolo sopra, video | contenuto (desktop); orizzontale: titolo+contenuto, poi video. Su mobile il video è sempre sotto (CSS). variant preview = anteprima builder (stesso layout, classi dedicate, no autoplay). */
function QuestionVideoLayout({ question, title, children, variant = 'fill' }) {
  const url = getQuestionVideoUrl(question);
  if (!parseStatementVideoUrl(url)) {
    return (
      <>
        {title}
        {children}
      </>
    );
  }
  const vertical = getQuestionVideoOrientation(question) === 'vertical';
  const autoplay = variant === 'fill';
  const video = <StatementVideoBlock url={url} variant={variant} autoplay={autoplay} />;
  const b = variant === 'preview' ? 'builder-preview-qvideo' : 'typeform-question-with-video';
  const rootClass = b + (vertical ? ` ${b}--orient-vertical` : ` ${b}--orient-horizontal`);
  if (vertical) {
    return (
      <div className={rootClass}>
        <div className={`${b}-titleband`}>{title}</div>
        <div className={`${b}-row`}>
          <div className={`${b}-media`}>{video}</div>
          <div className={`${b}-content`}>{children}</div>
        </div>
      </div>
    );
  }
  return (
    <div className={rootClass}>
      <div className={`${b}-stack`}>
        <div className={`${b}-textblock`}>
          {title}
          {children}
        </div>
        <div className={`${b}-media ${b}-media--below`}>{video}</div>
      </div>
    </div>
  );
}

function FillQuestionField({ question, value, onChange, autoFocus }) {
  if (question.type === 'statement') {
    const align = getStatementTextAlign(question);
    const hasVideo = Boolean(parseStatementVideoUrl(getQuestionVideoUrl(question)));
    const title = <h2 className="typeform-statement-title">{question.statementTitle || 'Titolo'}</h2>;
    const body = <div className={`typeform-statement-body typeform-statement-body--${align}`}>{question.statementBody || ''}</div>;
    if (!hasVideo) {
      return (
        <div className="typeform-statement-wrap">
          {title}
          {body}
        </div>
      );
    }
    return (
      <QuestionVideoLayout question={question} variant="fill" title={title}>
        {body}
      </QuestionVideoLayout>
    );
  }

  const title = <h2>{question.text || 'Domanda senza testo'}</h2>;
  const inner = (
    <>
      {question.type === 'choice' && (
        <div className="typeform-choices typeform-choices-radio" role="radiogroup" aria-label={question.text || 'Scegli un’opzione'}>
          {(question.options || []).map((opt, i) => (
            <label key={i} className={`typeform-choice-radio ${value === opt ? 'selected' : ''}`}>
              <input type="radio" className="typeform-choice-radio-input" name={'choice-' + question.id} checked={value === opt} onChange={() => onChange(opt)} />
              <span className="typeform-choice-radio-label">{opt}</span>
            </label>
          ))}
        </div>
      )}
      {question.type === 'quiz' && (
        <div className="typeform-choices">
          {(question.options || []).map((opt, i) => (
            <button key={i} type="button" className={`typeform-choice ${value === opt ? 'selected' : ''}`} onClick={() => onChange(opt)}>
              {opt}
            </button>
          ))}
        </div>
      )}
      {question.type === 'multi_choice' && (
        <div className="typeform-choices typeform-choices-check" role="group" aria-label={question.text || 'Seleziona una o più opzioni'}>
          {(question.options || []).map((opt, i) => {
            const arr = Array.isArray(value) ? value : [];
            const checked = arr.includes(opt);
            return (
              <label key={i} className={`typeform-choice-check ${checked ? 'selected' : ''}`}>
                <input
                  type="checkbox"
                  className="typeform-choice-check-input"
                  checked={checked}
                  onChange={(e) => {
                    const next = e.target.checked ? [...arr, opt] : arr.filter((x) => x !== opt);
                    onChange(next);
                  }}
                />
                <span className="typeform-choice-check-label">{opt}</span>
              </label>
            );
          })}
        </div>
      )}

      {(question.type === 'short' || question.type === 'email') && (
        <div className="input-wrap">
          <input type={question.type === 'email' ? 'email' : 'text'} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="Scrivi qui..." autoFocus={autoFocus} />
        </div>
      )}

      {question.type === 'long' && (
        <div className="input-wrap">
          <textarea value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="Scrivi qui..." autoFocus={autoFocus} />
        </div>
      )}

      {question.type === 'nps' && (
        <div className="typeform-nps">
          <span className="nps-label left">Per niente probabile</span>
          <div className="nps-buttons">
            {Array.from({ length: 11 }, (_, i) => (
              <button key={i} type="button" className={`typeform-nps-btn ${value === String(i) ? 'selected' : ''}`} onClick={() => onChange(String(i))}>{i}</button>
            ))}
          </div>
          <span className="nps-label right">Molto probabile</span>
        </div>
      )}

      {question.type === 'scale' && (
        <div className="typeform-scale">
          {(question.scaleLabelLeft || question.scaleLabelRight) && (
            <div className="scale-labels">
              <span>{question.scaleLabelLeft || ''}</span>
              <span>{question.scaleLabelRight || ''}</span>
            </div>
          )}
          <div className="scale-buttons">
            {Array.from({ length: (question.scaleMax || 5) - (question.scaleMin || 1) + 1 }, (_, i) => (question.scaleMin || 1) + i).map((n) => (
              <button key={n} type="button" className={`typeform-scale-btn ${value === String(n) ? 'selected' : ''}`} onClick={() => onChange(String(n))}>{n}</button>
            ))}
          </div>
        </div>
      )}

      {question.type === 'rating' && (
        <div className="typeform-rating">
          {Array.from({ length: question.stars || 5 }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" className={`typeform-star ${ Number(value) >= n ? 'filled' : ''}`} onClick={() => onChange(String(n))} aria-label={n + ' stella'}>★</button>
          ))}
        </div>
      )}

      {question.type === 'date' && (
        <div className="input-wrap">
          <input type="date" value={value || ''} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} />
        </div>
      )}

      {question.type === 'number' && (
        <div className="input-wrap">
          <input type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : e.target.value)} min={question.numberMin} max={question.numberMax} placeholder="Numero..." autoFocus={autoFocus} />
        </div>
      )}
    </>
  );
  return (
    <QuestionVideoLayout question={question} variant="fill" title={title}>
      {inner}
    </QuestionVideoLayout>
  );
}

function FillView({ form, onClose, onSubmit, onAddResponse, previewMode }) {
  const questions = form?.questions || [];
  const groups = React.useMemo(() => {
    const out = [];
    questions.forEach((q, idx) => {
      const prev = questions[idx - 1];
      const join = idx > 0 && q.sameSlideAsPrev && q.type !== 'statement' && prev?.type !== 'statement';
      if (join && out.length > 0) out[out.length - 1].push(idx);
      else out.push([idx]);
    });
    return out;
  }, [questions]);
  const [step, setStep] = React.useState(0);
  const [answers, setAnswers] = React.useState({});
  const [history, setHistory] = React.useState([0]);
  const firedSlidePixelsRef = React.useRef(new Set());
  const [submittedScore, setSubmittedScore] = React.useState(null); // quiz: { correct, total }
  const [submittedComputedScore, setSubmittedComputedScore] = React.useState(null);
  const [submittedMajorityResult, setSubmittedMajorityResult] = React.useState(null);

  const currentGroup = step >= 0 && step < groups.length ? groups[step] : null;
  const currentQuestions = currentGroup ? currentGroup.map((idx) => questions[idx]).filter(Boolean) : [];
  const current = currentQuestions[currentQuestions.length - 1] || null;
  const hasVideoInCurrentSlide = currentQuestions.some((q) => parseStatementVideoUrl(getQuestionVideoUrl(q)));
  const currentIndex = current ? questions.findIndex((q) => q.id === current.id) : -1;
  const showThankYou = step === -1;
  const showOutcomeSlide = step === -2;
  const thankYouPage = normalizeThankYouPageForLoad(form?.thankYouPage);
  const thankYouTitle = (thankYouPage.title || '').trim();
  const thankYouMessage = (thankYouPage.message || '').trim();
  const thankYouCtaLabel = (thankYouPage.ctaLabel || '').trim();
  const thankYouCtaUrl = (thankYouPage.ctaUrl || '').trim();
  const outcomeSlideContent = submittedMajorityResult != null ? getMajorityOutcomeSlideContent(form, submittedMajorityResult) : null;
  const thankYouMajorityContent =
    Boolean(form?.majorityProfile?.showResultOnThankYou) && submittedMajorityResult != null
      ? getMajorityOutcomeSlideContent(form, submittedMajorityResult)
      : null;

  // Progress: conta domande "visitate" per stima (con logica non è lineare)
  const totalSteps = groups.length;
  const progress = showThankYou || showOutcomeSlide
    ? 100
    : (totalSteps ? Math.min(100, ((history.length) / Math.max(totalSteps, 1)) * 100) : 0);

  React.useEffect(() => {
    if (previewMode || !currentQuestions.length) return;
    currentQuestions.forEach((q) => {
      const pixelUrl = String(q?.slidePixelUrl || '').trim();
      if (!pixelUrl) return;
      const fireOnce = q?.slidePixelFireOnce !== false;
      const key = `${form?.id || 'form'}:${q.id}:${pixelUrl}`;
      if (fireOnce && firedSlidePixelsRef.current.has(key)) return;
      const fired = fireSlidePixel(pixelUrl);
      if (fired && fireOnce) firedSlidePixelsRef.current.add(key);
    });
  }, [currentQuestions, previewMode, form?.id]);

  const setAnswer = (questionId, value) => {
    setAnswers((a) => ({ ...a, [questionId]: value }));
  };

  const canNext = () => {
    if (!currentQuestions.length) return false;
    return currentQuestions.every((q) => {
      if (q.type === 'statement') return true;
      const v = answers[q.id];
      if (q.type === 'choice' || q.type === 'quiz') return v != null && v !== '';
      if (q.type === 'multi_choice') return Array.isArray(v) && v.length > 0;
      if (q.type === 'nps' || q.type === 'scale' || q.type === 'rating') return v != null && v !== '';
      if (q.type === 'date' || q.type === 'number') return v != null && String(v).trim() !== '';
      return v != null && String(v).trim() !== '';
    });
  };

  const goNext = () => {
    if (!current) return;
    const result = getNextStepResult(questions, currentIndex, current, answers[current.id]);
    if (result.kind === 'redirect') {
      if (previewMode) {
        window.alert(`Anteprima: in produzione qui si aprirebbe il link:\n\n${result.url}`);
        setSubmittedScore(null);
        setSubmittedComputedScore(null);
        setSubmittedMajorityResult(null);
        setStep(-1);
        return;
      }
      window.location.assign(result.url);
      return;
    }
    if (result.kind === 'end') {
      let quizScore = null;
      const quizQuestions = questions.filter((q) => q.type === 'quiz');
      if (quizQuestions.length > 0) {
        let correct = 0;
        quizQuestions.forEach((q) => {
          if (answers[q.id] === q.correctAnswer) correct++;
        });
        quizScore = { correct, total: quizQuestions.length };
      }
      const computedScore = computeAggregatedScore(form, answers);
      const majorityResult = computeMajorityProfileResult(form, answers);
      setSubmittedComputedScore(computedScore);
      setSubmittedMajorityResult(majorityResult);
      if (!previewMode) {
        (onAddResponse || addResponseLocal)(form.id, answers, quizScore, computedScore, majorityResult);
      }
      setSubmittedScore(quizScore);
      const slideContent = getMajorityOutcomeSlideContent(form, majorityResult);
      const mp = form.majorityProfile || {};
      const showOutcome = thankYouPage.showResultSlide !== false && mp.showOutcomeSlide !== false && slideContent != null;
      setStep(showOutcome ? -2 : -1);
      return;
    }
    const nextIdx = result.index;
    const nextStep = groups.findIndex((g) => g.includes(nextIdx));
    const safeStep = nextStep >= 0 ? nextStep : Math.min(step + 1, groups.length - 1);
    setHistory((h) => [...h, safeStep]);
    setStep(safeStep);
  };

  const goPrev = () => {
    if (history.length <= 1) return;
    const prev = history.slice(0, -1);
    setHistory(prev);
    setStep(prev[prev.length - 1]);
  };

  if (!form) return null;

  return (
    <div className="typeform-view">
      <div className="typeform-progress">
        <div className="typeform-progress-inner" style={{ width: progress + '%' }} />
      </div>
      <button
        type="button"
        className="typeform-close"
        onClick={onClose}
        aria-label={previewMode ? 'Chiudi anteprima e torna alla modifica' : 'Chiudi'}
        title={previewMode ? 'Chiudi anteprima' : undefined}
      >
        ×
      </button>

      {showThankYou ? (
        <div className="thank-you-screen">
          {previewMode ? (
            <>
              <h2>{thankYouTitle || 'Fine anteprima'}</h2>
              <p className="thank-you-preview-note">Le risposte non sono state salvate: è solo un’anteprima del questionario.</p>
            </>
          ) : (
            <>
              <h2>{thankYouTitle || 'Grazie!'}</h2>
              <p>{thankYouMessage || 'Le tue risposte sono state salvate.'}</p>
            </>
          )}
          {submittedScore != null && (
            <p className="thank-you-score">Punteggio quiz: {submittedScore.correct}/{submittedScore.total}</p>
          )}
          {submittedComputedScore != null && (
            <p className="thank-you-score thank-you-computed-score">
              Risultato: <strong>{formatComputedScoreValue(submittedComputedScore.value)}</strong>
              {previewMode && <span className="thank-you-preview-note"> (anteprima)</span>}
            </p>
          )}
          {thankYouMajorityContent != null && (thankYouMajorityContent.title || (thankYouMajorityContent.body || '').trim() !== '') && (
            <div className="thank-you-majority">
              {(thankYouMajorityContent.title || '').trim() !== '' && (
                <h3 className="thank-you-majority-title">{thankYouMajorityContent.title}</h3>
              )}
              {(thankYouMajorityContent.body || '').trim() !== '' && (
                <div className="thank-you-majority-body">{thankYouMajorityContent.body}</div>
              )}
              {previewMode && (
                <p className="thank-you-preview-note">Anteprima: le risposte non sono salvate.</p>
              )}
            </div>
          )}
          {!previewMode && thankYouCtaLabel && thankYouCtaUrl && (
            <a
              className="btn-secondary thank-you-cta"
              href={thankYouCtaUrl}
              target={thankYouPage.ctaNewTab ? '_blank' : undefined}
              rel={thankYouPage.ctaNewTab ? 'noopener noreferrer' : undefined}
            >
              {thankYouCtaLabel}
            </a>
          )}
          <button className="btn-primary" onClick={onSubmit}>{previewMode ? 'Chiudi anteprima' : 'Chiudi'}</button>
        </div>
      ) : showOutcomeSlide && outcomeSlideContent ? (
        <div className="typeform-screen typeform-outcome-slide">
          <div className="typeform-outcome-slide-inner">
            <h2 className="typeform-outcome-slide-title">{outcomeSlideContent.title}</h2>
            {(outcomeSlideContent.body || '').trim() !== '' && (
              <div className="typeform-outcome-slide-body">{outcomeSlideContent.body}</div>
            )}
            <button type="button" className="typeform-next" onClick={() => setStep(-1)}>
              Continua
            </button>
          </div>
        </div>
      ) : current ? (
        <div className={'typeform-screen' + (hasVideoInCurrentSlide ? ' typeform-screen--scrollable' : '')}>
          {currentQuestions.length > 1 ? (
            <div className="typeform-slide-multi-card">
              <div className="typeform-slide-multi-grid">
                {currentQuestions.map((q, idx) => (
                  <div
                    key={q.id}
                    className={
                      'typeform-question-slot typeform-question-slot--in-multi '
                      + (isMultiSlideGridCompactType(q.type) ? 'typeform-question-slot--multi-compact' : 'typeform-question-slot--multi-full')
                      + (parseStatementVideoUrl(getQuestionVideoUrl(q)) ? ' typeform-question-slot--has-video' : '')
                    }
                  >
                    <div className="typeform-multi-field">
                      {q.type !== 'statement' && (
                        <div className="typeform-question-slot-index typeform-question-slot-index--multi">{idx + 1}</div>
                      )}
                      <div className="typeform-multi-field-main">
                        <FillQuestionField
                          question={q}
                          value={answers[q.id]}
                          onChange={(value) => setAnswer(q.id, value)}
                          autoFocus={idx === 0}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            currentQuestions.map((q, idx) => (
              <div
                key={q.id}
                className={'typeform-question-slot' + (parseStatementVideoUrl(getQuestionVideoUrl(q)) ? ' typeform-question-slot--has-video' : '')}
              >
                <FillQuestionField
                  question={q}
                  value={answers[q.id]}
                  onChange={(value) => setAnswer(q.id, value)}
                  autoFocus={idx === 0}
                />
              </div>
            ))
          )}

          <div className="typeform-screen-actions">
            {history.length > 1 && <button type="button" className="btn-secondary" onClick={goPrev}>Indietro</button>}
            <FillNextButton questions={questions} currentIndex={currentIndex} current={current} answers={answers} onNext={goNext} canNext={canNext} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CRMView({ forms, useApi }) {
  const [contacts, setContacts] = React.useState([]);
  const [lists, setLists] = React.useState([]);
  const [search, setSearch] = React.useState('');
  const [selectedListId, setSelectedListId] = React.useState('');
  const [selectedContactKey, setSelectedContactKey] = React.useState(null);
  const [newListName, setNewListName] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  const refreshCrm = React.useCallback(() => {
    setLoading(true);
    if (useApi) {
      Promise.all([
        fetch('/api/crm/contacts').then((r) => r.json()),
        fetch('/api/crm/lists').then((r) => r.json()),
      ])
        .then(([contactsData, listsData]) => {
          setContacts(Array.isArray(contactsData) ? contactsData : []);
          setLists(Array.isArray(listsData) ? listsData : []);
        })
        .catch(() => {
          const crm = getCrmLocal();
          setLists(crm.lists || []);
          setContacts(buildCrmContacts(forms, getResponsesLocal(), crm));
        })
        .finally(() => setLoading(false));
      return;
    }
    const crm = getCrmLocal();
    setLists(crm.lists || []);
    setContacts(buildCrmContacts(forms, getResponsesLocal(), crm));
    setLoading(false);
  }, [forms, useApi]);

  React.useEffect(() => {
    refreshCrm();
  }, [refreshCrm]);

  const selectedContact = contacts.find((c) => c.contactKey === selectedContactKey) || null;
  const listNameById = {};
  lists.forEach((l) => { listNameById[l.id] = l.name; });

  const filteredContacts = contacts.filter((c) => {
    if (selectedListId && !(c.listIds || []).includes(selectedListId)) return false;
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [c.name, c.email, c.phone, c.company].filter(Boolean).some((x) => String(x).toLowerCase().includes(term));
  });

  const createList = () => {
    const name = newListName.trim();
    if (!name) return;
    if (useApi) {
      fetch('/api/crm/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }).then(() => {
        setNewListName('');
        refreshCrm();
      });
      return;
    }
    const crm = getCrmLocal();
    crm.lists = [...(crm.lists || []), { id: 'l_' + Date.now(), name, createdAt: new Date().toISOString() }];
    saveCrmLocal(crm);
    setNewListName('');
    refreshCrm();
  };

  const deleteList = (id) => {
    if (!window.confirm('Eliminare questa lista?')) return;
    if (useApi) {
      fetch('/api/crm/lists/' + encodeURIComponent(id), { method: 'DELETE' }).then(refreshCrm);
      return;
    }
    const crm = getCrmLocal();
    crm.lists = (crm.lists || []).filter((l) => l.id !== id);
    Object.keys(crm.memberships || {}).forEach((contactKey) => {
      const next = (crm.memberships[contactKey] || []).filter((x) => x !== id);
      if (next.length === 0) delete crm.memberships[contactKey];
      else crm.memberships[contactKey] = next;
    });
    saveCrmLocal(crm);
    refreshCrm();
  };

  const toggleContactList = (contactKey, listId, checked) => {
    if (useApi) {
      if (checked) {
        fetch('/api/crm/lists/' + encodeURIComponent(listId) + '/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactKey }),
        }).then(refreshCrm);
      } else {
        fetch('/api/crm/lists/' + encodeURIComponent(listId) + '/contacts/' + encodeURIComponent(contactKey), { method: 'DELETE' }).then(refreshCrm);
      }
      return;
    }
    const crm = getCrmLocal();
    if (!Array.isArray(crm.memberships[contactKey])) crm.memberships[contactKey] = [];
    if (checked && !crm.memberships[contactKey].includes(listId)) crm.memberships[contactKey].push(listId);
    if (!checked) crm.memberships[contactKey] = crm.memberships[contactKey].filter((x) => x !== listId);
    if ((crm.memberships[contactKey] || []).length === 0) delete crm.memberships[contactKey];
    saveCrmLocal(crm);
    refreshCrm();
  };

  const deleteContact = (contactKey) => {
    if (!contactKey) return;
    if (!window.confirm('Eliminare definitivamente questo contatto? Verranno rimosse tutte le compilazioni collegate (da tutti i form), le iscrizioni alle liste e i deal associati. Operazione irreversibile.')) return;
    if (useApi) {
      fetch('/api/crm/contacts/' + encodeURIComponent(contactKey), { method: 'DELETE' })
        .then(() => {
          setSelectedContactKey(null);
          refreshCrm();
        })
        .catch(() => {});
      return;
    }
    deleteContactLocal(contactKey, forms);
    setSelectedContactKey(null);
    refreshCrm();
  };

  return (
    <div className="crm-view">
      <div className="crm-header">
        <h2>CRM contatti</h2>
        <p>Qui trovi tutti i contatti raccolti dalle compilazioni e puoi organizzarli in liste.</p>
      </div>

      <div className="crm-layout">
        <section className="crm-contacts-panel">
          <div className="crm-filters">
            <input
              type="text"
              className="crm-input"
              placeholder="Cerca per nome, email, telefono..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="crm-select" value={selectedListId} onChange={(e) => setSelectedListId(e.target.value)}>
              <option value="">Tutte le liste</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="empty-state"><p>Caricamento contatti...</p></div>
          ) : filteredContacts.length === 0 ? (
            <div className="empty-state"><p>Nessun contatto disponibile.</p></div>
          ) : (
            <div className="crm-contact-list">
              {filteredContacts.map((c) => (
                <button
                  key={c.contactKey}
                  type="button"
                  className={`crm-contact-row ${selectedContactKey === c.contactKey ? 'active' : ''}`}
                  onClick={() => setSelectedContactKey(c.contactKey)}
                >
                  <div className="crm-contact-main">
                    <strong>{c.name || c.email || 'Contatto senza nome'}</strong>
                    <span>{c.email || c.phone || 'Nessun recapito'}</span>
                  </div>
                  <div className="crm-contact-meta">
                    <span>{c.submissionsCount} invii</span>
                    <span>{new Date(c.lastSeen || Date.now()).toLocaleDateString('it-IT')}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="crm-side-panel">
          <div className="crm-lists-box">
            <h3>Liste</h3>
            <div className="crm-list-create">
              <input
                type="text"
                className="crm-input"
                placeholder="Nuova lista (es. Clienti caldi)"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
              />
              <button type="button" className="btn-primary" onClick={createList}>Crea</button>
            </div>
            <div className="crm-list-items">
              {lists.map((l) => (
                <div key={l.id} className="crm-list-item">
                  <span>{l.name}</span>
                  <button type="button" className="btn-remove" onClick={() => deleteList(l.id)}>×</button>
                </div>
              ))}
            </div>
          </div>

          <div className="crm-contact-detail">
            <h3>Dettaglio contatto</h3>
            {!selectedContact ? (
              <p className="crm-muted">Seleziona un contatto per assegnarlo alle liste.</p>
            ) : (
              <>
                <p><strong>Nome:</strong> {selectedContact.name || '—'}</p>
                <p><strong>Email:</strong> {selectedContact.email || '—'}</p>
                <p><strong>Telefono:</strong> {selectedContact.phone || '—'}</p>
                <p><strong>Azienda:</strong> {selectedContact.company || '—'}</p>
                <p><strong>Form compilati:</strong> {selectedContact.forms.length}</p>
                {selectedContact.majorityLabel && (
                  <p><strong>Profilo (ultima maggioranza):</strong> {selectedContact.majorityLabel}</p>
                )}
                <div className="crm-assign">
                  <h4>Assegna alle liste</h4>
                  {lists.length === 0 ? (
                    <p className="crm-muted">Crea prima una lista.</p>
                  ) : (
                    lists.map((l) => (
                      <label key={l.id} className="crm-check-row">
                        <input
                          type="checkbox"
                          checked={(selectedContact.listIds || []).includes(l.id)}
                          onChange={(e) => toggleContactList(selectedContact.contactKey, l.id, e.target.checked)}
                        />
                        {l.name}
                      </label>
                    ))
                  )}
                </div>
                <div className="crm-tags">
                  {(selectedContact.listIds || []).map((id) => (
                    <span key={id} className="crm-tag">{listNameById[id] || id}</span>
                  ))}
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <button type="button" className="btn-secondary" onClick={() => deleteContact(selectedContact.contactKey)}>
                    Elimina contatto
                  </button>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function DealsView({ forms, useApi }) {
  const [contacts, setContacts] = React.useState([]);
  const [pipelines, setPipelines] = React.useState([]);
  const [deals, setDeals] = React.useState([]);
  const [selectedPipelineId, setSelectedPipelineId] = React.useState('');
  const [newPipelineName, setNewPipelineName] = React.useState('');
  const [newStageName, setNewStageName] = React.useState('');
  const [newDealContactKey, setNewDealContactKey] = React.useState('');
  const [newDealTitle, setNewDealTitle] = React.useState('');
  const [newDealValue, setNewDealValue] = React.useState('');
  const [dragDealId, setDragDealId] = React.useState(null);
  const [editingPipeline, setEditingPipeline] = React.useState(false);
  const [pipelineDraftName, setPipelineDraftName] = React.useState('');
  const [editingStageId, setEditingStageId] = React.useState(null);
  const [stageDraftName, setStageDraftName] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId) || null;

  const refreshDeals = React.useCallback(() => {
    setLoading(true);
    if (useApi) {
      Promise.all([
        fetch('/api/crm/contacts').then((r) => r.json()),
        fetch('/api/deals/pipelines').then((r) => r.json()),
        fetch('/api/deals').then((r) => r.json()),
      ])
        .then(([contactsData, pipelinesData, dealsData]) => {
          const safePipelines = Array.isArray(pipelinesData) ? pipelinesData : [];
          setContacts(Array.isArray(contactsData) ? contactsData : []);
          setPipelines(safePipelines);
          setDeals(Array.isArray(dealsData) ? dealsData : []);
          if (!safePipelines.some((p) => p.id === selectedPipelineId)) setSelectedPipelineId(safePipelines[0]?.id || '');
        })
        .finally(() => setLoading(false));
      return;
    }
    const crm = getCrmLocal();
    const localPipelines = crm.dealPipelines || [];
    setPipelines(localPipelines);
    setDeals(crm.deals || []);
    setContacts(buildCrmContacts(forms, getResponsesLocal(), crm));
    if (!localPipelines.some((p) => p.id === selectedPipelineId)) setSelectedPipelineId(localPipelines[0]?.id || '');
    setLoading(false);
  }, [forms, selectedPipelineId, useApi]);

  React.useEffect(() => {
    refreshDeals();
  }, [refreshDeals]);

  const contactByKey = {};
  contacts.forEach((c) => { contactByKey[c.contactKey] = c; });

  const createPipeline = () => {
    const name = newPipelineName.trim();
    if (!name) return;
    if (useApi) {
      fetch('/api/deals/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }).then(() => {
        setNewPipelineName('');
        refreshDeals();
      });
      return;
    }
    const crm = getCrmLocal();
    const now = new Date().toISOString();
    const pipeline = {
      id: 'p_' + Date.now(),
      name,
      createdAt: now,
      stages: DEFAULT_DEAL_STAGES.map((stage) => ({ id: 's_' + Math.random().toString(36).slice(2, 8), name: stage })),
    };
    crm.dealPipelines = [...(crm.dealPipelines || []), pipeline];
    saveCrmLocal(crm);
    setNewPipelineName('');
    refreshDeals();
  };

  const savePipelineName = () => {
    if (!selectedPipeline) return;
    const name = pipelineDraftName.trim();
    if (!name || name === selectedPipeline.name) {
      setEditingPipeline(false);
      return;
    }
    if (useApi) {
      fetch('/api/deals/pipelines/' + encodeURIComponent(selectedPipeline.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }).then(() => {
        setEditingPipeline(false);
        refreshDeals();
      });
      return;
    }
    const crm = getCrmLocal();
    crm.dealPipelines = (crm.dealPipelines || []).map((p) => p.id === selectedPipeline.id ? { ...p, name } : p);
    saveCrmLocal(crm);
    setEditingPipeline(false);
    refreshDeals();
  };

  const deletePipeline = (pipelineId) => {
    if (!window.confirm('Eliminare questa pipeline con tutti i deal?')) return;
    if (useApi) {
      fetch('/api/deals/pipelines/' + encodeURIComponent(pipelineId), { method: 'DELETE' }).then(refreshDeals);
      return;
    }
    const crm = getCrmLocal();
    crm.dealPipelines = (crm.dealPipelines || []).filter((p) => p.id !== pipelineId);
    crm.deals = (crm.deals || []).filter((d) => d.pipelineId !== pipelineId);
    saveCrmLocal(crm);
    refreshDeals();
  };

  const addStage = () => {
    if (!selectedPipeline) return;
    const name = newStageName.trim();
    if (!name) return;
    if (useApi) {
      fetch('/api/deals/pipelines/' + encodeURIComponent(selectedPipeline.id) + '/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }).then(() => {
        setNewStageName('');
        refreshDeals();
      });
      return;
    }
    const crm = getCrmLocal();
    crm.dealPipelines = (crm.dealPipelines || []).map((p) => {
      if (p.id !== selectedPipeline.id) return p;
      return { ...p, stages: [...(p.stages || []), { id: 's_' + Math.random().toString(36).slice(2, 8), name }] };
    });
    saveCrmLocal(crm);
    setNewStageName('');
    refreshDeals();
  };

  const saveStageName = (stageId) => {
    if (!selectedPipeline) return;
    const name = stageDraftName.trim();
    if (!name) {
      setEditingStageId(null);
      return;
    }
    const stage = (selectedPipeline.stages || []).find((s) => s.id === stageId);
    if (!stage || stage.name === name) {
      setEditingStageId(null);
      return;
    }
    if (useApi) {
      fetch('/api/deals/pipelines/' + encodeURIComponent(selectedPipeline.id) + '/stages/' + encodeURIComponent(stageId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }).then(() => {
        setEditingStageId(null);
        refreshDeals();
      });
      return;
    }
    const crm = getCrmLocal();
    crm.dealPipelines = (crm.dealPipelines || []).map((p) => {
      if (p.id !== selectedPipeline.id) return p;
      return { ...p, stages: (p.stages || []).map((s) => s.id === stageId ? { ...s, name } : s) };
    });
    saveCrmLocal(crm);
    setEditingStageId(null);
    refreshDeals();
  };

  const deleteStage = (stageId) => {
    if (!selectedPipeline) return;
    if ((selectedPipeline.stages || []).length <= 1) return;
    if (!window.confirm('Eliminare questo stage? I deal verranno spostati nel primo stage.')) return;
    if (useApi) {
      fetch('/api/deals/pipelines/' + encodeURIComponent(selectedPipeline.id) + '/stages/' + encodeURIComponent(stageId), { method: 'DELETE' }).then(refreshDeals);
      return;
    }
    const crm = getCrmLocal();
    const pipeline = (crm.dealPipelines || []).find((p) => p.id === selectedPipeline.id);
    if (!pipeline) return;
    const nextStages = (pipeline.stages || []).filter((s) => s.id !== stageId);
    const fallbackStageId = nextStages[0]?.id;
    crm.dealPipelines = (crm.dealPipelines || []).map((p) => p.id === selectedPipeline.id ? { ...p, stages: nextStages } : p);
    crm.deals = (crm.deals || []).map((d) => {
      if (d.pipelineId === selectedPipeline.id && d.stageId === stageId) return { ...d, stageId: fallbackStageId, updatedAt: new Date().toISOString() };
      return d;
    });
    saveCrmLocal(crm);
    refreshDeals();
  };

  const createDeal = () => {
    if (!selectedPipeline) return;
    if (!newDealContactKey) return;
    const firstStage = selectedPipeline.stages?.[0];
    if (!firstStage) return;
    const payload = {
      pipelineId: selectedPipeline.id,
      stageId: firstStage.id,
      contactKey: newDealContactKey,
      title: newDealTitle.trim() || null,
      value: newDealValue === '' ? null : Number(newDealValue),
    };
    if (useApi) {
      fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(() => {
        setNewDealContactKey('');
        setNewDealTitle('');
        setNewDealValue('');
        refreshDeals();
      });
      return;
    }
    const crm = getCrmLocal();
    crm.deals = [...(crm.deals || []), {
      id: 'd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      pipelineId: payload.pipelineId,
      stageId: payload.stageId,
      contactKey: payload.contactKey,
      title: payload.title,
      value: Number.isNaN(Number(payload.value)) ? null : Number(payload.value),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];
    saveCrmLocal(crm);
    setNewDealContactKey('');
    setNewDealTitle('');
    setNewDealValue('');
    refreshDeals();
  };

  const moveDeal = (dealId, stageId) => {
    if (useApi) {
      fetch('/api/deals/' + encodeURIComponent(dealId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId }),
      }).then(refreshDeals);
      return;
    }
    const crm = getCrmLocal();
    crm.deals = (crm.deals || []).map((d) => d.id === dealId ? { ...d, stageId, updatedAt: new Date().toISOString() } : d);
    saveCrmLocal(crm);
    refreshDeals();
  };

  const removeDeal = (dealId) => {
    if (useApi) {
      fetch('/api/deals/' + encodeURIComponent(dealId), { method: 'DELETE' }).then(refreshDeals);
      return;
    }
    const crm = getCrmLocal();
    crm.deals = (crm.deals || []).filter((d) => d.id !== dealId);
    saveCrmLocal(crm);
    refreshDeals();
  };

  const dealsForPipeline = deals.filter((d) => d.pipelineId === selectedPipelineId);
  const euroFmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

  return (
    <div className="deals-view">
      <div className="deals-header">
        <h2>Deal</h2>
        <p>Gestisci pipeline e stage. Aggiungi manualmente i contatti dal CRM; le regole automatiche da form verranno aggiunte dopo.</p>
      </div>

      <div className="deals-topbar">
        <input className="crm-input" placeholder="Nuova pipeline (es. B2B Italia)" value={newPipelineName} onChange={(e) => setNewPipelineName(e.target.value)} />
        <button type="button" className="btn-primary" onClick={createPipeline}>Crea pipeline</button>
        <select className="crm-select deals-pipeline-select" value={selectedPipelineId} onChange={(e) => setSelectedPipelineId(e.target.value)}>
          <option value="">Seleziona pipeline</option>
          {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {selectedPipeline && !editingPipeline && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { setEditingPipeline(true); setPipelineDraftName(selectedPipeline.name || ''); }}
          >
            Rinomina pipeline
          </button>
        )}
        {selectedPipeline && editingPipeline && (
          <>
            <input className="crm-input deals-inline-input" value={pipelineDraftName} onChange={(e) => setPipelineDraftName(e.target.value)} />
            <button type="button" className="btn-primary" onClick={savePipelineName}>Salva</button>
            <button type="button" className="btn-secondary" onClick={() => setEditingPipeline(false)}>Annulla</button>
          </>
        )}
        {selectedPipeline && <button type="button" className="btn-delete" onClick={() => deletePipeline(selectedPipeline.id)}>Elimina pipeline</button>}
      </div>

      {!selectedPipeline ? (
        <div className="empty-state"><p>Crea o seleziona una pipeline per iniziare.</p></div>
      ) : (
        <>
          <div className="deals-create">
            <h3>Aggiungi deal manuale da CRM</h3>
            <div className="deals-create-row">
              <select className="crm-select" value={newDealContactKey} onChange={(e) => setNewDealContactKey(e.target.value)}>
                <option value="">Seleziona contatto CRM</option>
                {contacts.map((c) => (
                  <option key={c.contactKey} value={c.contactKey}>
                    {(c.name || c.email || 'Contatto')} {c.email ? `(${c.email})` : ''}
                  </option>
                ))}
              </select>
              <input className="crm-input" placeholder="Titolo deal (opzionale)" value={newDealTitle} onChange={(e) => setNewDealTitle(e.target.value)} />
              <input className="crm-input deals-value-input" type="number" placeholder="Valore €" value={newDealValue} onChange={(e) => setNewDealValue(e.target.value)} />
              <button type="button" className="btn-primary" onClick={createDeal}>Aggiungi</button>
            </div>
          </div>

          <div className="deals-stages-tools">
            <input className="crm-input" placeholder="Nuovo stage (es. Demo prenotata)" value={newStageName} onChange={(e) => setNewStageName(e.target.value)} />
            <button type="button" className="btn-secondary" onClick={addStage}>+ Stage</button>
          </div>

          {loading ? (
            <div className="empty-state"><p>Caricamento deal...</p></div>
          ) : (
            <div className="deals-board">
              {(selectedPipeline.stages || []).map((stage) => {
                const stageDeals = dealsForPipeline.filter((d) => d.stageId === stage.id);
                const stageTotal = stageDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
                return (
                  <section
                    key={stage.id}
                    className={`deals-column ${dragDealId ? 'droppable' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const dealId = e.dataTransfer.getData('text/deal-id');
                      if (dealId) moveDeal(dealId, stage.id);
                      setDragDealId(null);
                    }}
                  >
                    <header className="deals-column-header">
                      {editingStageId === stage.id ? (
                        <div className="deals-stage-editor">
                          <input className="crm-input deals-inline-input" value={stageDraftName} onChange={(e) => setStageDraftName(e.target.value)} />
                          <button type="button" className="btn-primary" onClick={() => saveStageName(stage.id)}>✓</button>
                          <button type="button" className="btn-secondary" onClick={() => setEditingStageId(null)}>×</button>
                        </div>
                      ) : (
                        <>
                          <h4>{stage.name}</h4>
                          <div className="deals-stage-header-right">
                            <span>{stageDeals.length}</span>
                            <button type="button" className="deals-mini-btn" onClick={() => { setEditingStageId(stage.id); setStageDraftName(stage.name || ''); }} title="Rinomina stage">✎</button>
                            <button type="button" className="deals-mini-btn deals-mini-btn-danger" onClick={() => deleteStage(stage.id)} disabled={(selectedPipeline.stages || []).length <= 1} title="Elimina stage">🗑</button>
                          </div>
                        </>
                      )}
                    </header>
                    <div className="deals-column-total">{euroFmt.format(stageTotal)}</div>
                    <div className="deals-cards">
                      {stageDeals.length === 0 ? (
                        <p className="crm-muted">Nessun deal</p>
                      ) : stageDeals.map((deal) => {
                        const contact = contactByKey[deal.contactKey];
                        return (
                          <article
                            key={deal.id}
                            className={`deal-card ${dragDealId === deal.id ? 'dragging' : ''}`}
                            draggable
                            onDragStart={(e) => { setDragDealId(deal.id); e.dataTransfer.setData('text/deal-id', deal.id); e.dataTransfer.effectAllowed = 'move'; }}
                            onDragEnd={() => setDragDealId(null)}
                          >
                            <strong>{deal.title || contact?.name || contact?.email || 'Deal'}</strong>
                            <div className="deal-card-sub">{contact?.email || contact?.phone || deal.contactKey}</div>
                            {deal.value != null && <div className="deal-card-value">{euroFmt.format(deal.value)}</div>}
                            <div className="deal-card-actions">
                              <select value={deal.stageId} onChange={(e) => moveDeal(deal.id, e.target.value)} className="crm-select">
                                {(selectedPipeline.stages || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                              <button type="button" className="btn-remove" onClick={() => removeDeal(deal.id)}>×</button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function formatAnswerForDisplay(val) {
  if (val == null || val === '') return '—';
  if (Array.isArray(val)) return val.length ? val.join(', ') : '—';
  return String(val);
}

function ResultsView({ form, useApi, onBack }) {
  const [responses, setResponses] = React.useState([]);

  React.useEffect(() => {
    if (!form?.id) return;
    if (useApi) {
      fetch('/api/forms/' + encodeURIComponent(form.id) + '/responses')
        .then((r) => r.json())
        .then(setResponses)
        .catch(() => setResponses([]));
    } else {
      ensureResponseIdsLocal(form.id);
      setResponses(getResponsesLocal()[form.id] || []);
    }
  }, [form?.id, useApi]);

  const deleteResponse = (responseId) => {
    if (!responseId || !window.confirm('Eliminare questa risposta? L’operazione non è reversibile.')) return;
    if (useApi) {
      fetch('/api/forms/' + encodeURIComponent(form.id) + '/responses/' + encodeURIComponent(responseId), { method: 'DELETE' })
        .then((r) => {
          if (!r.ok) throw new Error();
          return fetch('/api/forms/' + encodeURIComponent(form.id) + '/responses');
        })
        .then((r) => r.json())
        .then(setResponses)
        .catch(() => {});
      return;
    }
    deleteResponseLocal(form.id, responseId);
    setResponses(getResponsesLocal()[form.id] || []);
  };
  const npsQuestions = (form?.questions || []).filter((q) => q.type === 'nps');
  const quizQuestions = (form?.questions || []).filter((q) => q.type === 'quiz');

  const npsAverages = {};
  npsQuestions.forEach((q) => {
    const values = responses.map((r) => r.answers[q.id]).filter((v) => v != null && v !== '');
    const nums = values.map(Number).filter((n) => !Number.isNaN(n));
    npsAverages[q.id] = nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : null;
  });

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button className="btn-secondary" onClick={onBack}>← Indietro</button>
        <h2>Risultati: {form?.title || 'Form'}</h2>
      </div>
      {npsQuestions.length > 0 && (
        <div className="results-summary" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Media NPS</h3>
          {npsQuestions.map((q) => (
            <div key={q.id} style={{ marginBottom: '0.5rem' }}>
              <strong>{q.text}</strong>: {npsAverages[q.id] != null ? `${npsAverages[q.id]} / 10` : '—'}
            </div>
          ))}
        </div>
      )}
      {quizQuestions.length > 0 && responses.some((r) => r.quizScore != null) && (
        <div className="results-summary" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Punteggi quiz</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Ogni risposta mostra punteggio (corrette / totali).</p>
        </div>
      )}
      {form?.scoring?.enabled && responses.some((r) => r.computedScore != null) && (
        <div className="results-summary" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Risultato formula</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Valore calcolato con la formula impostata nel builder (scheda Punteggio).</p>
        </div>
      )}
      {(form?.majorityProfile?.enabled || form?.scoring?.mode === 'majority') && responses.some((r) => r.majorityResult != null) && (
        <div className="results-summary" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Profilo a maggioranza</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Etichetta (A, B, C… o PAREGGIO) come su Brevo/CRM; sotto, titolo e testo della slide se configurati.</p>
        </div>
      )}
      {responses.length === 0 ? (
        <div className="empty-state">
          <p>Ancora nessuna risposta a questo form.</p>
        </div>
      ) : (
        <div className="results-list">
          {responses.map((r, i) => (
            <div key={r.id || i} className="result-card">
              <div className="result-meta" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
                <span>
                Risposta #{i + 1} – {new Date(r.date).toLocaleString('it-IT')}
                {r.quizScore != null && (
                  <span className="result-quiz-score"> — Quiz: {r.quizScore.correct}/{r.quizScore.total}</span>
                )}
                {r.computedScore != null && r.computedScore.value != null && (
                  <span className="result-quiz-score"> — Risultato: {formatComputedScoreValue(r.computedScore.value)}</span>
                )}
                {r.majorityResult != null && !r.majorityResult.empty && (
                  <span className="result-quiz-score">
                    {' — Esito '}
                    <strong>{r.majorityResult.profileLabel || (r.majorityResult.tie ? 'PAREGGIO' : r.majorityResult.winner) || '—'}</strong>
                  </span>
                )}
                </span>
                {r.id && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: '0.85rem' }}
                    onClick={() => deleteResponse(r.id)}
                  >
                    Elimina risposta
                  </button>
                )}
              </div>
              {r.majorityResult != null && !r.majorityResult.empty && (() => {
                const mc = getMajorityOutcomeSlideContent(form, r.majorityResult);
                if (mc && ((mc.title || '').trim() !== '' || (mc.body || '').trim() !== '')) {
                  return (
                    <div className="result-majority-block">
                      {(mc.title || '').trim() !== '' && <div className="result-majority-title">{mc.title}</div>}
                      {(mc.body || '').trim() !== '' && <div className="result-majority-msg">{mc.body}</div>}
                    </div>
                  );
                }
                if ((r.majorityResult.message || '').trim() !== '') {
                  return <div className="result-majority-msg">{r.majorityResult.message}</div>;
                }
                return null;
              })()}
              <div className="result-answers">
                {form?.questions?.map((q) => (
                  <div key={q.id}>
                    <strong>{q.type === 'statement' ? (q.statementTitle || 'Slide') : q.text}</strong>
                    <br />
                    <span>{q.type === 'statement' ? '— (slide informativa)' : formatAnswerForDisplay(r.answers[q.id])}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function PipelineView({ form, useApi, onBack, onRefresh }) {
  const [responses, setResponses] = React.useState([]);
  const [selectedLead, setSelectedLead] = React.useState(null);

  React.useEffect(() => {
    if (!form?.id || !useApi) return;
    fetch('/api/forms/' + encodeURIComponent(form.id) + '/responses')
      .then((r) => r.json())
      .then(setResponses)
      .catch(() => setResponses([]));
  }, [form?.id, useApi]);

  const stages = form?.pipelineStages || DEFAULT_PIPELINE_STAGES;
  const byStage = {};
  stages.forEach((s) => { byStage[s] = []; });
  responses.forEach((r) => {
    const stage = r.stage || stages[0];
    if (!byStage[stage]) byStage[stage] = [];
    byStage[stage].push(r);
  });

  const updateStage = (responseId, newStage) => {
    fetch('/api/forms/' + encodeURIComponent(form.id) + '/responses/' + encodeURIComponent(responseId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: newStage }),
    })
      .then(() => fetch('/api/forms/' + encodeURIComponent(form.id) + '/responses').then((r) => r.json()).then(setResponses))
      .then(onRefresh);
  };

  const deletePipelineResponse = (responseId) => {
    if (!responseId || !window.confirm('Eliminare questa risposta dalla pipeline?')) return;
    fetch('/api/forms/' + encodeURIComponent(form.id) + '/responses/' + encodeURIComponent(responseId), { method: 'DELETE' })
      .then((r) => {
        if (!r.ok) throw new Error();
        return fetch('/api/forms/' + encodeURIComponent(form.id) + '/responses');
      })
      .then((r) => r.json())
      .then((data) => {
        setResponses(data);
        setSelectedLead(null);
        onRefresh();
      })
      .catch(() => {});
  };

  const contactFields = form?.contactFields || {};
  const getLeadPreview = (r) => {
    const email = contactFields.email ? (r.answers || {})[contactFields.email] : null;
    const name = contactFields.name ? (r.answers || {})[contactFields.name] : null;
    if (name || email) return [name, email].filter(Boolean).join(' · ');
    const first = form?.questions?.[0];
    const firstVal = first ? (r.answers || {})[first.id] : null;
    return firstVal ? String(firstVal).slice(0, 40) : new Date(r.date).toLocaleDateString('it-IT');
  };

  if (!useApi) return <div className="app-main"><button className="btn-secondary" onClick={onBack}>← Indietro</button><p style={{ marginTop: '1rem' }}>La pipeline è disponibile solo con il server attivo.</p></div>;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button className="btn-secondary" onClick={onBack}>← Indietro</button>
        <h2>Pipeline: {form?.title || 'Form'}</h2>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
        Trascina i lead tra le fasi o usa il menu per spostarli. Clicca una card per vedere i dettagli.
      </p>
      <div className="pipeline-board">
        {stages.map((stage) => (
          <div key={stage} className="pipeline-column">
            <div className="pipeline-column-header">
              <span className="pipeline-stage-name">{stage}</span>
              <span className="pipeline-stage-count">{(byStage[stage] || []).length}</span>
            </div>
            <div className="pipeline-cards">
              {(byStage[stage] || []).map((r) => (
                <div key={r.id} className="pipeline-card" onClick={() => setSelectedLead(r)}>
                  <div className="pipeline-card-preview">{getLeadPreview(r)}</div>
                  <div className="pipeline-card-date">{new Date(r.date).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}</div>
                  <select
                    className="pipeline-card-stage-select"
                    value={stage}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateStage(r.id, e.target.value)}
                  >
                    {stages.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {selectedLead && (
        <div className="pipeline-modal-overlay" onClick={() => setSelectedLead(null)}>
          <div className="pipeline-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pipeline-modal-header">
              <h3>Lead – {new Date(selectedLead.date).toLocaleString('it-IT')}</h3>
              <button type="button" className="btn-remove" onClick={() => setSelectedLead(null)}>×</button>
            </div>
            <div className="pipeline-modal-body">
              {form?.questions?.map((q) => (
                <div key={q.id} style={{ marginBottom: '0.75rem' }}>
                  <strong style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{q.type === 'statement' ? (q.statementTitle || 'Slide') : q.text}</strong>
                  <div>{q.type === 'statement' ? '— (slide informativa)' : formatAnswerForDisplay(selectedLead.answers?.[q.id])}</div>
                </div>
              ))}
              {selectedLead.majorityResult != null && !selectedLead.majorityResult.empty && (selectedLead.majorityResult.winner || selectedLead.majorityResult.tie || (selectedLead.majorityResult.profileLabel || '').trim() !== '') && (
                <div className="pipeline-majority-summary">
                  <div>
                    <strong>Esito (etichetta)</strong>:{' '}
                    {selectedLead.majorityResult.profileLabel || (selectedLead.majorityResult.tie ? 'PAREGGIO' : selectedLead.majorityResult.winner) || '—'}
                  </div>
                  {(() => {
                    const mc = getMajorityOutcomeSlideContent(form, selectedLead.majorityResult);
                    if (mc && ((mc.title || '').trim() !== '' || (mc.body || '').trim() !== '')) {
                      return (
                        <>
                          {(mc.title || '').trim() !== '' && <div className="pipeline-majority-title"><strong>Slide</strong>: {mc.title}</div>}
                          {(mc.body || '').trim() !== '' && <div className="pipeline-majority-msg">{mc.body}</div>}
                        </>
                      );
                    }
                    if ((selectedLead.majorityResult.message || '').trim() !== '') {
                      return <div className="pipeline-majority-msg">{selectedLead.majorityResult.message}</div>;
                    }
                    return null;
                  })()}
                </div>
              )}
              <div style={{ marginTop: '1rem' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Fase </label>
                <select
                  value={selectedLead.stage}
                  onChange={(e) => { updateStage(selectedLead.id, e.target.value); setSelectedLead({ ...selectedLead, stage: e.target.value }); }}
                >
                  {stages.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {selectedLead.id && (
                <div style={{ marginTop: '1rem' }}>
                  <button type="button" className="btn-secondary" onClick={() => deletePipelineResponse(selectedLead.id)}>
                    Elimina risposta
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Vista solo per i clienti: solo compilazione, senza dashboard (link condiviso)
function ClientFillApp({ formId }) {
  const [form, setForm] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    fetch('/api/forms/' + encodeURIComponent(formId))
      .then((r) => { if (!r.ok) throw new Error('Form non trovato'); return r.json(); })
      .then(setForm)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [formId]);

  const onAddResponse = (id, answers, quizScore, computedScore, majorityResult) => {
    return fetch('/api/forms/' + encodeURIComponent(id) + '/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers, quizScore, computedScore, majorityResult }),
    });
  };

  if (loading) return <div className="typeform-view" style={{ alignItems: 'center', justifyContent: 'center' }}><p>Caricamento...</p></div>;
  if (error || !form) return <div className="typeform-view" style={{ alignItems: 'center', justifyContent: 'center', padding: '2rem' }}><p>Form non trovato o link non valido.</p></div>;

  return (
    <FillView
      form={form}
      onClose={() => window.close()}
      onSubmit={() => {}}
      onAddResponse={onAddResponse}
    />
  );
}

const fillId = getFillFormIdFromUrl();
const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(fillId ? <ClientFillApp formId={fillId} /> : <App />);
