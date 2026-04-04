/**
 * Router Express per tutte le route /api/forms/* (condiviso tra server.js e Vercel).
 */
function createFormsRouter(express, deps) {
  const {
    readForms,
    writeForms,
    readResponses,
    writeResponses,
    DEFAULT_STAGES,
    genId,
    runAutomations,
    syncResponseToBrevo,
    syncResponseToCrmMirrorList,
  } = deps;

  const router = express.Router();

  router.get('/', (req, res) => {
    res.json(readForms());
  });

  router.get('/:id', (req, res) => {
    const forms = readForms();
    const form = forms.find((f) => f.id === req.params.id);
    if (!form) return res.status(404).json({ error: 'Form non trovato' });
    res.json(form);
  });

  router.post('/', (req, res) => {
    const form = req.body;
    if (!form.id || !form.title) return res.status(400).json({ error: 'id e title richiesti' });
    const forms = readForms();
    const idx = forms.findIndex((f) => f.id === form.id);
    if (idx >= 0) forms[idx] = form;
    else forms.push(form);
    writeForms(forms);
    res.json(form);
  });

  router.delete('/:id', (req, res) => {
    const formId = req.params.id;
    const forms = readForms().filter((f) => f.id !== formId);
    writeForms(forms);
    const responses = readResponses();
    delete responses[formId];
    writeResponses(responses);
    res.status(204).send();
  });

  router.get('/:id/responses', (req, res) => {
    const responses = readResponses();
    let list = responses[req.params.id] || [];
    const forms = readForms();
    const form = forms.find((f) => f.id === req.params.id);
    const stages = form?.pipelineStages || DEFAULT_STAGES;
    let changed = false;
    list = list.map((r) => {
      if (r.id && r.stage != null) return r;
      changed = true;
      return { ...r, id: r.id || genId(), stage: r.stage || stages[0] || 'Nuovo' };
    });
    if (changed) {
      responses[req.params.id] = list;
      writeResponses(responses);
    }
    res.json(list);
  });

  router.post('/:id/responses', async (req, res) => {
    const { answers, quizScore, computedScore, majorityResult } = req.body || {};
    const formId = req.params.id;
    const forms = readForms();
    const form = forms.find((f) => f.id === formId);
    const stages = form?.pipelineStages || DEFAULT_STAGES;
    const defaultStage = stages[0] || 'Nuovo';

    const responses = readResponses();
    if (!responses[formId]) responses[formId] = [];

    const id = genId();
    let response = {
      id,
      date: new Date().toISOString(),
      answers: answers || {},
      quizScore: quizScore ?? null,
      computedScore: computedScore ?? null,
      majorityResult: majorityResult ?? null,
      stage: defaultStage,
    };

    response = runAutomations(form || { automations: [] }, id, response, responses[formId]);
    responses[formId].push(response);
    writeResponses(responses);

    try {
      if (form) await syncResponseToBrevo(form, response);
    } catch (e) {
      console.error('[Brevo] sync error', e);
    }
    try {
      if (form) syncResponseToCrmMirrorList(form, response);
    } catch (e) {
      console.error('[CRM] mirror list sync error', e);
    }

    res.status(201).json({ ok: true, responseId: id });
  });

  router.patch('/:formId/responses/:responseId', (req, res) => {
    const { formId, responseId } = req.params;
    const { stage } = req.body || {};
    const responses = readResponses();
    const list = responses[formId];
    if (!list) return res.status(404).json({ error: 'Nessuna risposta' });
    const idx = list.findIndex((r) => r.id === responseId);
    if (idx < 0) return res.status(404).json({ error: 'Risposta non trovata' });
    if (stage) list[idx].stage = stage;
    writeResponses(responses);
    res.json(list[idx]);
  });

  router.delete('/:formId/responses/:responseId', (req, res) => {
    const { formId, responseId } = req.params;
    const responses = readResponses();
    const list = responses[formId];
    if (!list) return res.status(404).json({ error: 'Nessuna risposta' });
    const idx = list.findIndex((r) => r.id === responseId);
    if (idx < 0) return res.status(404).json({ error: 'Risposta non trovata' });
    list.splice(idx, 1);
    if (list.length === 0) delete responses[formId];
    else responses[formId] = list;
    writeResponses(responses);
    res.status(204).send();
  });

  return router;
}

module.exports = createFormsRouter;
