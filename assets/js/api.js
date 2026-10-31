export function registrationQuery(value) {
  const text = String(value || '').trim();
  if (!text) throw new Error('Enter an Entry ID, email, or full name.');
  if (/^https?:\/\//i.test(text)) {
    const entry = new URL(text).searchParams.get('entry');
    if (!entry || !/^REG-\d+$/i.test(entry)) {
      throw new Error('This QR code is not a registration ticket.');
    }
    return entry.toUpperCase();
  }
  return text;
}

export function validateEndpoint(value) {
  const url = new URL(value.trim());
  if (url.origin !== 'https://script.google.com' || !/^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname)) {
    throw new Error('Enter the deployed Apps Script URL ending in /exec.');
  }
  return url.href;
}

async function post(endpoint, payload) {
  let response;
  try {
    response = await fetch(validateEndpoint(endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      credentials: 'omit',
      redirect: 'follow',
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify(payload)
    });
  } catch {
    throw new Error(payload.action === 'confirm'
      ? 'Confirmation response unavailable. Look up this ticket again before retrying; entry may already be recorded.'
      : 'Cannot reach the sheet. Check your connection and Apps Script deployment access.');
  }
  if (!response.ok) throw new Error('Server unavailable. Please try again.');
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('Invalid server response. Check the Apps Script deployment and try again.');
  }
  if (!result || !['OK', 'VALID', 'INVALID', 'ALREADY_ENTERED', 'ERROR', 'AUTH_REQUIRED'].includes(result.status)) {
    throw new Error('Unexpected server response. Look up the ticket again.');
  }
  if (result.status === 'AUTH_REQUIRED') {
    const error = new Error(result.message || 'Staff session expired. Sign in again.');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }
  if (result.status === 'ERROR') throw new Error(result.message || 'The request failed.');
  return result;
}

export function login(settings, googleIdToken, pin) {
  return post(settings.endpoint, { action: 'login', googleIdToken, pin });
}

export function request(settings, action, query = '') {
  return post(settings.endpoint, { action, query, sessionToken: settings.sessionToken });
}

export function logout(settings) {
  return request(settings, 'logout');
}