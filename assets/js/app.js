import { registrationQuery, validateEndpoint, login, request, logout } from './api.js';

// ============================================================================
// EMBEDDED CONFIGURATION - Staff can only change PIN in Script Properties
// ============================================================================
const CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxjcOeNgcLUtYt3kHfV3KNVpbFNTQF2PUcmR319Z398MXgfu3iCpyFmKVu8p4zKeCbk7g/exec',
  GOOGLE_CLIENT_ID: '558932417013-8tfd4sv5pcgjqtctedsjkni2dqadc2kt.apps.googleusercontent.com'
};

const element = id => document.getElementById(id);
let settings = null;
let busy = false;
let connecting = false;
let cameraStarting = false;
let cameraActive = false;
let scanner = null;
let currentEntry = '';
let decoding = false;
let statsBusy = false;
let googleIdToken = '';
let googleInitializedClientId = '';
const incomingEntry = new URLSearchParams(location.search).get('entry');

function icons() {
  window.lucide?.createIcons();
}
window.addEventListener('load', icons);
icons();

function notice(message, error = false) {
  element('notice').textContent = message;
  element('notice').classList.toggle('error', error);
}

function updateControls() {
  const blocked = !settings || busy || cameraStarting || connecting;
  for (const id of ['cameraButton', 'photoButton', 'lookupButton', 'query']) element(id).disabled = blocked;
  element('refreshButton').disabled = blocked || statsBusy;
  element('confirmButton').disabled = blocked || !currentEntry;
  element('nextButton').disabled = busy || cameraStarting;
  element('settingsButton').disabled = !settings || busy || cameraStarting || connecting;
  element('cameraButtonLabel').textContent = cameraStarting ? 'Starting...' : cameraActive ? 'Stop camera' : 'Start camera';
}

function resetResult() {
  currentEntry = '';
  element('result').hidden = true;
  element('emptyResult').hidden = false;
  element('confirmButton').hidden = true;
  updateControls();
}

function showResult(result) {
  element('emptyResult').hidden = true;
  element('result').hidden = false;
  element('result').dataset.status = result.status;
  const confirmed = result.status === 'VALID' && Boolean(result.entryTime);
  const eligible = result.status === 'VALID' && !confirmed && Boolean(result.entryId);
  currentEntry = eligible ? String(result.entryId) : '';
  element('resultStatus').textContent = result.status === 'INVALID' ? 'Entry not allowed'
    : result.status === 'ALREADY_ENTERED' ? 'Already entered'
    : confirmed ? 'Entry confirmed' : 'Valid registration';
  element('resultName').textContent = result.name || 'Registration not found';
  element('resultDetails').hidden = result.status === 'INVALID';
  element('resultId').textContent = result.entryId || '-';
  element('resultStudent').textContent = result.studentId || '-';
  element('resultCount').textContent = result.attendeeCount ?? 1;
  element('resultTime').textContent = result.entryTime || 'Not entered';
  element('resultMessage').textContent = result.message || '';
  element('confirmButton').hidden = !eligible;
  updateControls();
  if (matchMedia('(max-width: 700px)').matches) element('ticketHeading').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

async function refreshStats() {
  if (!settings || statsBusy) return;
  statsBusy = true;
  updateControls();
  try {
    const result = await request(settings, 'stats');
    if (result.status !== 'OK') throw new Error('Live totals unavailable.');
    for (const id of ['registeredCount', 'enteredCount', 'remainingCount']) element(id).textContent = result[id] ?? '-';
  } catch (error) {
    handleRequestError(error);
  } finally {
    statsBusy = false;
    updateControls();
  }
}

async function stopCamera() {
  if (!cameraActive) return;
  await scanner.stop();
  cameraActive = false;
  scanner.clear();
  element('cameraPlaceholder').hidden = false;
  element('cameraLabel').textContent = 'Camera off';
  updateControls();
}

async function lookup(value) {
  if (busy || !settings) return;
  busy = true;
  resetResult();
  notice('Checking registration...');
  try {
    await stopCamera();
    const query = registrationQuery(value);
    element('query').value = query;
    const result = await request(settings, 'lookup', query);
    showResult(result);
    notice('Registration checked against the sheet.');
  } catch (error) {
    handleRequestError(error);
  } finally {
    busy = false;
    updateControls();
  }
}

async function startCamera() {
  if (!window.Html5Qrcode) throw new Error('QR scanner could not load. Check your connection or use manual lookup.');
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera requires HTTPS in Chrome or Safari. Open the GitHub Pages link directly, or upload a QR image.');
  }
  cameraStarting = true;
  decoding = false;
  resetResult();
  element('cameraLabel').textContent = 'Opening camera...';
  updateControls();
  try {
    scanner ??= new Html5Qrcode('reader', { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] });
    await scanner.start({ facingMode: 'environment' }, {
      fps: 10,
      qrbox: (width, height) => {
        const size = Math.floor(Math.min(width, height) * .72);
        return { width: size, height: size };
      }
    }, text => {
      if (decoding || cameraStarting || busy) return;
      decoding = true;
      lookup(text);
    }, () => {});
    cameraActive = true;
    element('cameraPlaceholder').hidden = true;
    notice('Camera active.');
  } catch (error) {
    element('cameraPlaceholder').hidden = false;
    element('cameraLabel').textContent = 'Camera unavailable';
    throw new Error('Camera unavailable. Allow camera access in your browser, or use Upload QR. ' + (error.message || String(error)));
  } finally {
    cameraStarting = false;
    updateControls();
  }
}

element('cameraButton').addEventListener('click', async () => {
  try {
    if (cameraActive) { await stopCamera(); notice('Camera stopped.'); }
    else await startCamera();
  } catch (error) { notice(error.message, true); }
});

element('searchForm').addEventListener('submit', event => {
  event.preventDefault();
  lookup(element('query').value);
});

element('confirmButton').addEventListener('click', async () => {
  if (busy || !currentEntry) return;
  const entry = currentEntry;
  currentEntry = '';
  busy = true;
  element('confirmButton').hidden = true;
  updateControls();
  notice('Recording entry...');
  try {
    const result = await request(settings, 'confirm', entry);
    showResult(result);
    notice(result.status === 'VALID' && result.entryTime ? 'Entry saved to the sheet.' : result.message);
    await refreshStats();
  } catch (error) {
    resetResult();
    element('query').value = entry;
    handleRequestError(error);
  } finally {
    busy = false;
    updateControls();
  }
});

element('photoButton').addEventListener('click', () => element('photoInput').click());
element('photoInput').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file || busy || !settings) return;
  busy = true;
  resetResult();
  notice('Reading QR image...');
  let fileScanner;
  let decoded;
  try {
    await stopCamera();
    if (!window.Html5Qrcode) throw new Error('Scanner library unavailable.');
    fileScanner = new Html5Qrcode('fileReader', { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] });
    decoded = await fileScanner.scanFile(file, false);
  } catch {
    notice('Could not read this image. Choose a clear photo of the complete QR code, or look up the Entry ID.', true);
  } finally {
    fileScanner?.clear();
    busy = false;
    updateControls();
  }
  if (decoded) await lookup(decoded);
});

element('nextButton').addEventListener('click', () => {
  resetResult();
  element('query').value = '';
  notice('Ready for the next guest.');
  element('scanHeading').scrollIntoView({ block: 'start', behavior: 'smooth' });
});
element('refreshButton').addEventListener('click', refreshStats);

function openSettings() {
  element('settingsError').textContent = '';
  if (!element('settingsDialog').open) element('settingsDialog').showModal();
}

function handleRequestError(error) {
  if (error.code === 'AUTH_REQUIRED') {
    signOut(false, error.message);
    return;
  }
  notice(error.message, true);
}

function resetGoogleLogin() {
  googleIdToken = '';
  element('googleSigninSection').hidden = true;
  element('pinInputSection').hidden = false;
  element('staffPin').value = '';
  element('googleButton').hidden = true;
  element('googleSetupButton').hidden = false;
  element('googleIdentityStatus').textContent = '';
  element('connectButton').hidden = true;
  element('staffPin').focus();
}

function renderGoogleButton() {
  // Use embedded configuration
  const clientId = CONFIG.GOOGLE_CLIENT_ID;
  const endpoint = CONFIG.APPS_SCRIPT_URL;

  if (!clientId) throw new Error('Google Client ID not configured.');
  if (!endpoint) throw new Error('Apps Script URL not configured.');
  if (!window.google?.accounts?.id) throw new Error('Google sign-in is still loading. Try again in a moment.');

  if (googleInitializedClientId !== clientId) {
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: response => {
        if (!response.credential) {
          element('settingsError').textContent = 'Google sign-in did not return an ID token. Try again.';
          return;
        }
        googleIdToken = response.credential;
        element('settingsError').textContent = '';
        element('googleIdentityStatus').textContent = 'Google account verified. Click "Start check-in" to continue.';
        element('googleButton').hidden = true;
        element('googleSetupButton').hidden = true;
        element('connectButton').hidden = false;
        element('connectButton').focus();
      }
    });
    googleInitializedClientId = clientId;
  }

  element('googleButton').replaceChildren();
  element('googleButton').hidden = false;
  element('googleSetupButton').hidden = true;
  window.google.accounts.id.renderButton(element('googleButton'), {
    theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular',
    width: Math.min(360, element('settingsDialog').clientWidth - 50)
  });
}

async function signOut(revoke = true, message = 'Signed out.') {
  const previous = settings;
  settings = null;
  try { if (cameraActive) await stopCamera(); } catch {}
  if (previous && revoke) {
    try { await logout(previous); } catch {}
  }
  resetGoogleLogin();
  for (const id of ['registeredCount', 'enteredCount', 'remainingCount']) element(id).textContent = '-';
  element('connection').textContent = 'Staff sign-in required';
  element('connection').classList.remove('connected');
  element('gateLabel').textContent = 'Entry desk';
  resetResult();
  openSettings();
  element('settingsError').textContent = message;
  updateControls();
}

element('verifyPinButton').addEventListener('click', async event => {
  event.preventDefault();
  const pin = element('staffPin').value.trim();
  
  if (!/^[0-9]{4}$/.test(pin)) {
    element('settingsError').textContent = 'Enter a valid 4-digit PIN.';
    return;
  }
  
  // Store the PIN temporarily for later use with Google login
  sessionStorage.setItem('staff-pin', pin);
  
  try {
    element('settingsError').textContent = 'Verifying PIN...';
    element('verifyPinButton').disabled = true;
    
    // Try to validate PIN with backend (optional - for real-time feedback)
    // For now, just proceed to Google sign-in if PIN format is valid
    element('settingsError').textContent = '';
    element('pinInputSection').hidden = true;
    element('googleSigninSection').hidden = false;
    
    renderGoogleButton();
    element('googleSetupButton').focus();
  } catch (error) {
    element('settingsError').textContent = error.message;
  } finally {
    element('verifyPinButton').disabled = false;
  }
});

element('googleSetupButton').addEventListener('click', () => {
  try {
    renderGoogleButton();
  } catch (error) {
    element('settingsError').textContent = error.message;
  }
});

element('settingsForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (connecting) return;
  if (!googleIdToken) {
    element('settingsError').textContent = 'Complete Google sign-in before proceeding.';
    return;
  }

  const pin = sessionStorage.getItem('staff-pin');
  if (!pin || !/^[0-9]{4}$/.test(pin)) {
    element('settingsError').textContent = 'PIN verification is required.';
    return;
  }

  connecting = true;
  element('connectButton').disabled = true;
  element('settingsError').textContent = 'Verifying staff access...';
  updateControls();
  try {
    // Use embedded configuration
    const candidate = {
      endpoint: validateEndpoint(CONFIG.APPS_SCRIPT_URL),
      googleClientId: CONFIG.GOOGLE_CLIENT_ID
    };
    const result = await login(candidate, googleIdToken, pin);
    candidate.sessionToken = result.sessionToken;
    candidate.email = result.email;
    const stats = await request(candidate, 'stats');
    if (stats.status !== 'OK') throw new Error('The sheet did not return registration totals.');

    settings = candidate;
    googleIdToken = '';
    sessionStorage.removeItem('staff-pin');
    element('connection').textContent = 'Staff signed in';
    element('connection').classList.add('connected');
    element('gateLabel').textContent = candidate.email;
    for (const id of ['registeredCount', 'enteredCount', 'remainingCount']) element(id).textContent = stats[id] ?? '-';
    resetResult();
    element('settingsDialog').close();
    notice('Signed in. Ready for the next guest.');
  } catch (error) {
    element('settingsError').textContent = error.message;
    if (error.code === 'AUTH_REQUIRED') resetGoogleLogin();
  } finally {
    connecting = false;
    element('connectButton').disabled = false;
    updateControls();
  }

  if (settings && incomingEntry && !element('settingsDialog').open) {
    await lookup(incomingEntry);
    history.replaceState(null, '', location.pathname);
  }
});

element('settingsButton').addEventListener('click', () => signOut());
element('settingsDialog').addEventListener('cancel', event => event.preventDefault());

try {
  const saved = JSON.parse(localStorage.getItem('venue-checkin-settings') || '{}');
  element('endpoint').value = saved.endpoint || '';
  element('googleClientId').value = saved.googleClientId || '';
} catch {}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && cameraActive) stopCamera().catch(error => notice(error.message, true));
});
updateControls();
openSettings();