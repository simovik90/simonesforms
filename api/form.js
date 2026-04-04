/**
 * Serverless Vercel: un solo file `api/form.js`.
 * Gli URL pubblici restano /api/forms e /api/forms/... (vedi vercel.json → routes).
 * Env: solo process.env su Vercel; dotenv è in server.js se !VERCEL.
 */
const express = require('express');
const cookieParser = require('cookie-parser');
const { getCookieSecret, requireAuth, isPublicFormsApiRoute } = require('../lib/sessionAuth');
const createFormsRouter = require('../lib/formsRouter');
const { getFormsRouterDeps } = require('../server');

/** Ripristina path reale dopo i `routes` in vercel.json (→ /api/form o /api/form?__p=...). */
function applyVercelPathRewrite(req) {
  if (req.query && Object.prototype.hasOwnProperty.call(req.query, '__p')) {
    const raw = req.query.__p;
    const seg = Array.isArray(raw) ? raw.join('/') : String(raw || '');
    const base = '/api/forms';
    const pathOnly = seg ? `${base}/${seg.replace(/^\/+/, '')}` : base;
    const rest = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query)) {
      if (k === '__p') continue;
      const val = Array.isArray(v) ? v[v.length - 1] : v;
      if (val != null && val !== '') rest.append(k, val);
    }
    const q = rest.toString();
    req.url = q ? `${pathOnly}?${q}` : pathOnly;
    return;
  }
  const pathOnly = (req.url || '').split('?')[0];
  if (pathOnly === '/api/form') {
    const tail = (req.url || '').split('?')[1];
    req.url = tail ? `/api/forms?${tail}` : '/api/forms';
  }
}

const app = express();
app.use(express.json());
app.use(cookieParser(getCookieSecret()));

app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  if (isPublicFormsApiRoute(req.method, req.path)) return next();
  return requireAuth(req, res, next);
});

app.use('/api/forms', createFormsRouter(express, getFormsRouterDeps()));

module.exports = (req, res) => {
  applyVercelPathRewrite(req);
  return app(req, res);
};
