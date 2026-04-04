const AUTH_COOKIE_NAME = 'sf_session';

function getCookieSecret() {
  return String(process.env.AUTH_COOKIE_SECRET || 'dev-cookie-secret-cambia-in-env').trim();
}

function isAuthenticated(req) {
  return req.signedCookies && req.signedCookies[AUTH_COOKIE_NAME] === '1';
}

function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  return res.status(401).json({ error: 'Autenticazione richiesta' });
}

/** Solo endpoint /api/forms usati senza login (compilazione pubblica). */
function isPublicFormsApiRoute(method, p) {
  if (method === 'GET' && /^\/api\/forms\/[^/]+$/.test(p)) return true;
  if (method === 'POST' && /^\/api\/forms\/[^/]+\/responses$/.test(p)) return true;
  return false;
}

module.exports = {
  AUTH_COOKIE_NAME,
  getCookieSecret,
  isAuthenticated,
  requireAuth,
  isPublicFormsApiRoute,
};
