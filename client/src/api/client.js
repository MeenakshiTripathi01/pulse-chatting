import axios from 'axios';

// Same-origin '/api' by default (Vite proxy in development, Express in production).
// Set VITE_API_URL only when the API lives on a different origin. It is a public URL, not a
// secret: anything in VITE_* variables is bundled into the JavaScript sent to browsers.
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // send the HttpOnly session cookie with every request
  timeout: 15_000,
});

const SAFE_METHODS = new Set(['get', 'head', 'options']);

let csrfToken = null;
let pendingCsrfRequest = null;

/** Fetches the CSRF token once and shares it between concurrent requests. */
async function getCsrfToken() {
  if (csrfToken) return csrfToken;

  pendingCsrfRequest ??= api
    .get('/auth/csrf')
    .then((response) => {
      csrfToken = response.data.csrfToken;
      return csrfToken;
    })
    .finally(() => {
      pendingCsrfRequest = null;
    });

  return pendingCsrfRequest;
}

api.interceptors.request.use(async (config) => {
  if (!SAFE_METHODS.has(config.method)) {
    config.headers.set('X-CSRF-Token', await getCsrfToken());
  }
  return config;
});

let unauthorizedHandler = null;

/** Lets the auth provider react when any request reports that the session has ended. */
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;
    const code = response?.data?.error?.code;

    // The token can go stale (e.g. cookie expired); fetch a fresh one and retry once.
    if (response?.status === 403 && code === 'CSRF_INVALID' && config && !config.csrfRetried) {
      csrfToken = null;
      config.csrfRetried = true;
      return api(config);
    }

    if (response?.status === 401 && !config?.skipUnauthorizedHandler) {
      unauthorizedHandler?.();
    }

    return Promise.reject(error);
  },
);

/** Turns any API/network error into a sentence that is safe to show to users. */
export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (error?.response?.data?.error?.message) return error.response.data.error.message;
  if (error?.code === 'ECONNABORTED') return 'The server took too long to respond. Please try again.';
  if (error?.request && !error.response) {
    return "Can't reach the server. Check your connection and try again.";
  }
  return fallback;
}

/** Field-level validation errors returned by the API, e.g. { email: "..." }. */
export function getFieldErrors(error) {
  return error?.response?.data?.error?.details ?? {};
}

export function getErrorCode(error) {
  return error?.response?.data?.error?.code ?? null;
}
