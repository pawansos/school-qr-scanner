# Security Analysis & Recommendations

## Current Security Issues

### 🔴 CRITICAL: Exposed Google Apps Script URL
**Risk:** Your Apps Script URL is publicly visible in the GitHub Pages static code. Anyone can find and potentially abuse it.

**Current State:**
```javascript
// In api.js - Users must enter this URL, which is then sent in requests
const endpoint = validateEndpoint(value);
// This URL is stored in localStorage and sent with every request
```

**Why It's Vulnerable:**
- The URL pattern follows Google's standard format: `https://script.google.com/macros/s/{SCRIPT_ID}/exec`
- Anyone can POST requests directly to this endpoint
- No built-in rate limiting if attackers script lookups
- The Apps Script deployment is public to anyone with the URL

---

### 🟠 HIGH: Staff PIN is hardcoded & exposed
**Risk:** The PIN is stored in `CONFIG.STAFF_PIN = "3867"` in the public Google Apps Script code.

**Current State:**
```javascript
const CONFIG = {
  STAFF_PIN: "3867",  // ← PUBLIC AND HARDCODED
};
```

**Why It's Vulnerable:**
- Anyone reading the Apps Script source can see the PIN
- No rate limiting on PIN attempts
- Same PIN for all staff members

---

### 🟠 HIGH: No CORS/Origin Validation
**Risk:** The Apps Script accepts requests from ANY origin since it's deployed publicly.

**Current State:**
```javascript
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
    // No validation of where the request came from
  }
}
```

**Vulnerabilities:**
- Browser CORS doesn't protect server-to-server attacks
- Attackers can POST from their own scripts
- No whitelisting of allowed domains

---

### 🟠 HIGH: No Request Signing/Validation
**Risk:** Requests aren't cryptographically signed, so anyone can forge them.

**Current State:**
- Only `googleIdToken` and `pin` are validated
- The `sessionToken` is just a cache key string with no cryptographic validation
- No HMAC or JWT signing of requests

---

### 🟡 MEDIUM: Session Token is Predictable/Weak
**Risk:** Session tokens might not be cryptographically secure.

**Current State:**
```javascript
// In the createStaffSession_ function
// The sessionToken is stored in Google Cache Service
// But it's generated without specified security
```

---

## Recommended Security Improvements

### Solution 1: Move Backend to a Protected Service (RECOMMENDED)
**Instead of Google Apps Script deployed publicly:**

Deploy to:
- **Google Cloud Run** (serverless, auto-scaling, you control access)
- **Firebase Cloud Functions** (integrated with Firebase Auth)
- **AWS Lambda with API Gateway** (with API key/AWS SigV4 signing)
- **Vercel API Routes** (serverless, built for Next.js)

**Benefits:**
- Can require authentication for entire API
- Can validate request origin (referer headers, CORS)
- Can implement rate limiting
- Can add request signing
- Can use server-side environment variables (no secrets in code)

---

### Solution 2: Secure Google Apps Script (If You Must Keep It)

#### Step 1: Move Secrets to Script Properties (Not Code)
```javascript
// Set via Apps Script Project Settings → Script Properties
const properties = PropertiesService.getScriptProperties();
const STAFF_PIN = properties.getProperty('STAFF_PIN'); // "3867"
const GOOGLE_CLIENT_ID = properties.getProperty('GOOGLE_CLIENT_ID');
const STAFF_EMAILS = properties.getProperty('STAFF_EMAILS'); // comma-separated
const API_SECRET = properties.getProperty('API_SECRET'); // for signing
```

**How to set:**
1. In Apps Script Editor: Click `Project Settings` (gear icon)
2. Scroll to "Script Properties"
3. Add properties: `STAFF_PIN`, `GOOGLE_CLIENT_ID`, `STAFF_EMAILS`, `API_SECRET`
4. Click "Save"

#### Step 2: Add Request Signing (HMAC-SHA256)
**Frontend (app.js):**
```javascript
async function post(endpoint, payload) {
  const secret = prompt('Enter API Secret:'); // Store securely somehow
  const timestamp = Date.now();
  const signaturePayload = JSON.stringify(payload) + timestamp + secret;
  const signature = await sha256(signaturePayload); // crypto library
  
  payload._ts = timestamp;
  payload._sig = signature;
  
  return fetch(endpoint, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
```

**Backend (Code.gs):**
```javascript
function doPost(e) {
  const properties = PropertiesService.getScriptProperties();
  const apiSecret = properties.getProperty('API_SECRET');
  const body = JSON.parse(e.postData.contents);
  
  // Verify request signature
  const timestamp = body._ts;
  const signature = body._sig;
  
  if (!timestamp || !signature) {
    return jsonResponse_({ status: 'ERROR', message: 'Invalid request' });
  }
  
  if (Date.now() - timestamp > 300000) { // 5 minutes
    return jsonResponse_({ status: 'ERROR', message: 'Request expired' });
  }
  
  const expectedSig = sha256Json(body) + timestamp + apiSecret;
  if (signature !== expectedSig) {
    return jsonResponse_({ status: 'ERROR', message: 'Invalid signature' });
  }
  
  // Continue processing
}
```

#### Step 3: Implement Rate Limiting
```javascript
function checkRateLimit(clientId, action) {
  const cache = CacheService.getScriptCache();
  const key = `ratelimit:${clientId}:${action}`;
  const count = parseInt(cache.get(key) || '0');
  
  if (count > 10) { // 10 requests per minute
    throw new Error('Rate limit exceeded');
  }
  
  cache.put(key, String(count + 1), 60); // 60 second expiry
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const clientIp = e.remoteAddress;
  
  checkRateLimit(clientIp, body.action);
  // Continue...
}
```

#### Step 4: Add Origin/Referer Validation
```javascript
function doPost(e) {
  // Check referer header
  const referer = e.parameter.referer || '';
  const allowedOrigins = [
    'https://pawansos.github.io',
    'https://localhost:3000'
  ];
  
  if (!allowedOrigins.some(origin => referer.startsWith(origin))) {
    return jsonResponse_({ status: 'ERROR', message: 'Unauthorized origin' });
  }
  
  // Continue...
}
```

---

## Security Checklist

- [ ] Move staff PIN to Script Properties (not hardcoded)
- [ ] Move Google Client ID to Script Properties
- [ ] Implement request signing (HMAC-SHA256)
- [ ] Add rate limiting by IP
- [ ] Add origin/referer validation
- [ ] Set secure cache expiry for session tokens (15 minutes max)
- [ ] Generate cryptographically secure session tokens
- [ ] Add request timestamp validation
- [ ] Enable HTTPS everywhere (already done with GitHub Pages)
- [ ] Log all authentication attempts
- [ ] Consider moving to Cloud Run for better security

---

## Best Practice Architecture

```
┌─────────────────────────────────┐
│  GitHub Pages (Static Frontend) │
│  - QR Scanner UI                │
│  - Client-side validation       │
│  - NO secrets in code           │
└──────────────┬──────────────────┘
               │ HTTPS
               │ Signed Requests
               ↓
┌─────────────────────────────────┐
│  Google Cloud Run (Backend)     │
│  - API Key validation           │
│  - Request signature verification
│  - Rate limiting                │
│  - CORS validation              │
│  - Secrets in env vars          │
└──────────────┬──────────────────┘
               │
               ↓
┌─────────────────────────────────┐
│  Google Sheets                  │
│  - Registration data            │
│  - Entry records                │
│  - Read/write via Cloud Run only│
└─────────────────────────────────┘
```

---

## Next Steps

1. **Immediate:** Move PIN & Client ID to Script Properties
2. **Short-term:** Implement rate limiting and request signing
3. **Long-term:** Migrate to Google Cloud Run for better security isolation

Would you like help implementing any of these security fixes?
