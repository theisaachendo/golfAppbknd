/**
 * Logs every request and response: method, path, status, and bodies (sensitive fields redacted).
 */

const SENSITIVE_KEYS = ['password', 'token', 'authorization'];

function redact(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const keyLower = k.toLowerCase();
    if (SENSITIVE_KEYS.some((s) => keyLower.includes(s))) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = redact(v);
    }
  }
  return out;
}

function safeJson(obj) {
  if (obj === undefined) return undefined;
  try {
    return JSON.stringify(redact(obj));
  } catch {
    return String(obj);
  }
}

export function requestLogger(req, res, next) {
  const start = Date.now();
  const method = req.method;
  const path = req.originalUrl || req.url;

  // Log incoming request (body only for methods that typically have one)
  const hasBody = req.body && Object.keys(req.body).length > 0;
  const authHeader = req.headers.authorization
    ? (req.headers.authorization.startsWith('Bearer ') ? 'Bearer ***' : '[REDACTED]')
    : undefined;
  console.log(
    `[${new Date().toISOString()}] --> ${method} ${path}` +
      (hasBody ? ` body: ${safeJson(req.body)}` : '') +
      (authHeader ? ` auth: ${authHeader}` : '')
  );

  // Capture response
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    const ms = Date.now() - start;
    const status = res.statusCode;
    const statusLabel = status >= 200 && status < 300 ? 'OK' : status >= 400 ? 'ERROR' : '';
    console.log(
      `[${new Date().toISOString()}] <-- ${method} ${path} ${status} ${statusLabel} (${ms}ms)` +
        (body !== undefined ? ` body: ${safeJson(body)}` : '')
    );
    return originalJson(body);
  };

  next();
}
