# Security: Attack Scenarios & Mitigations

## Scenario 1: Brute Force PIN Attack

### ❌ BEFORE (Vulnerable)
```
Attacker discovers Apps Script URL from GitHub
Attacker writes a loop to try all 10,000 possible 4-digit PINs:

for pin in 0000...9999:
  curl -X POST https://script.google.com/macros/s/AKfycby.../exec \
    -d '{"action":"login","pin":"'$pin'","googleIdToken":"..."}' 

Result: Takes ~7 minutes to crack the PIN
Damage: Full access to check-in system
```

### ✅ AFTER (Hardened)
```
Attacker makes 20 requests from same IP
- Requests 1-15: Processed normally
- Requests 16-20: REJECTED - "Rate limit exceeded"

Engine: Rate limiter kicks in for 60 seconds
All requests from that IP are blocked for 1 minute
Then bucket resets

Result: Attacker can only try 15 PINs per minute per IP
To test 10,000 PINs takes 11+ hours
After 3 failed attempts, wise attacker gives up
Logging: Every attempt is logged with IP address
```

**Mitigation added by:** `checkRateLimit_(remoteAddress, action)`

---

## Scenario 2: CSRF Attack (Cross-Site Request Forgery)

### ❌ BEFORE (Vulnerable)
```
Attacker creates malicious website: attacker.com
Attacker tricks staff member to visit malicious site
Site contains hidden form:

<form action="https://script.google.com/macros/s/AKfycby.../exec" method="POST">
  <input name="action" value="confirm">
  <input name="query" value="REG-000001">
</form>
<script>document.forms[0].submit();</script>

If staff is logged in, their browser sends valid session token
Attacker can confirm entries for non-existent guests!
```

### ✅ AFTER (Hardened)
```
Request origin validation kicks in:

Request includes header:
  Referer: https://attacker.com/malicious-page

Code checks:
  if (!allowedOrigins.includes("https://attacker.com")) {
    REJECT - "Unauthorized origin"
  }

Result: Request BLOCKED
Entry NOT confirmed
Only requests from https://pawansos.github.io are accepted
```

**Mitigation added by:** `validateRequestOrigin_(e)`

---

## Scenario 3: Session Token Replay Attack

### ❌ BEFORE (Vulnerable)
```
Attacker monitors network traffic (using WiFi sniffing)
Captures staff member's session token:
  sessionToken: "some-predictable-string"

Later (tomorrow):
  curl -X POST https://script.google.com/macros/s/AKfycby.../exec \
    -d '{"action":"stats","sessionToken":"some-predictable-string"}'

Result: Request succeeds!
Session token has no expiry
Attacker can access system indefinitely
```

### ✅ AFTER (Hardened)
```
Session created with:
- Cryptographic random ID (UUID)
- 15-minute expiry time stored in token metadata
- Timestamp validation

Attacker replays captured token tomorrow:
1. Backend checks cache: "Do I have session:uuid?"
2. Cache has expired (more than 15 minutes)
3. Returns: null
4. Request rejected: "Staff session expired"

Result: Session REJECTED
Attacker cannot access system

+ Tokens are deleted on logout
+ Tokens are cryptographically random (not predictable)
```

**Mitigation added by:**
- `generateSecureSessionToken_()` - Uses `Utilities.getUuid()` 
- Session expiry: 900 seconds (15 minutes)
- Cache TTL prevents token reuse

---

## Scenario 4: Hardcoded Secret Exposure

### ❌ BEFORE (Vulnerable)
```
Attacker reads public GitHub code:
  STAFF_PIN: "3867",
  GOOGLE_CLIENT_ID: "558932417013-rsuv...",

Attacker now knows:
- The exact PIN
- The Client ID they need to forge tokens
- Can craft Google ID tokens

Result: Attacker can log in as any staff member!
```

### ✅ AFTER (Hardened)
```
GitHub repository contains NO secrets:
- STAFF_PIN is stored in Google Apps Script Properties (not visible)
- GOOGLE_CLIENT_ID is stored in Google Apps Script Properties
- API_SECRET is stored in Properties (not in code)

Public repository only has template:
  function getSecureConfig_() {
    const props = PropertiesService.getScriptProperties();
    return {
      STAFF_PIN: props.getProperty('STAFF_PIN'),  // ← empty in code
      // ...
    };
  }

Attacker reading GitHub sees no actual values
Attacker cannot log in without the real PIN from your system

Result: Secrets PROTECTED
Even if GitHub is compromised, production secrets are safe
```

**Mitigation added by:** Moving all values to Script Properties

---

## Scenario 5: Unauthorized API Access

### ❌ BEFORE (Vulnerable)
```
Attacker finds the Apps Script URL
Attacker doesn't need to log in at all
They can call the "stats" endpoint directly:

curl -X POST https://script.google.com/macros/s/AKfycby.../exec \
  -d '{"action":"stats"}'

Result: 
{
  "status": "OK",
  "registeredCount": 450,
  "enteredCount": 127,
  "remainingCount": 323
}

Attacker learns:
- Total number of registrants
- How many have entered
- Timing of events
- Can use this for social engineering
```

### ✅ AFTER (Hardened)
```
Attacker makes same request:

curl -X POST https://script.google.com/macros/s/AKfycby.../exec \
  -d '{"action":"stats"}'

Code checks:
  if (!staff || sessionToken invalid) {
    return {
      status: 'AUTH_REQUIRED',
      message: 'Staff session expired. Sign in again.'
    }
  }

Result: Request REJECTED
No data leaked
Attacker must authenticate first
Only real staff with PIN can access system

+ Logging captures attempted unauthorized access
+ IP address of attacker is recorded
+ Alert could be set up for repeated failed attempts
```

**Mitigation added by:** Session validation on all endpoints

---

## Scenario 6: Man-in-the-Middle (MITM) Attack

### ❌ BEFORE (Vulnerable)
```
Attacker intercepts network traffic on public WiFi
Captures HTTPS traffic (Google OAuth)
Tries to downgrade to HTTP... fails (HTTPS is enforced)

But they DO see:
- The Apps Script URL
- The Client ID
- Pattern of requests

Via separate attack (phishing), they get:
- Staff member's Google password
- Could forge Google tokens

Result: Attacker has all pieces to access system
```

### ✅ AFTER (Hardened)
```
Same WiFi attack scenario:

Attacker intercepts traffic but sees:
- HTTPS connections (cannot decrypt)
- Random session tokens (no pattern)
- Cannot see secrets (stored server-side)
- Rate limiting blocks brute force
- Origin validation blocks CSRF

Even if Google password is compromised:
- Attacker needs a valid session token (expires in 15 mins)
- Attacker needs to be on approved staff email list
- Attacker needs the correct PIN (changed, now secret)
- Rate limiting blocks rapid-fire attempts

Result: Multiple security layers prevent attack
Attacker needs to compromise multiple systems
Much higher barrier to entry
```

---

## Summary of Security Improvements

| Attack Vector | Vulnerability | Fix | Status |
|---|---|---|---|
| Brute Force PIN | No rate limiting | Rate limit: 15 req/min per IP | ✅ FIXED |
| CSRF | No origin validation | Check Referer header | ✅ FIXED |
| Session Replay | No expiry | 15-min expiry + UUID | ✅ FIXED |
| Hardcoded Secrets | Secrets in code | Move to Script Properties | ✅ FIXED |
| Unauthorized Access | No authentication | Require session token | ✅ FIXED |
| PIN Bruteforce | Weak PIN handling | Rate limited + logged | ✅ FIXED |
| Data Exposure | No access control | Session required for all endpoints | ✅ FIXED |

---

## Remaining Risks & Next Steps

### ⚠️ Medium Risk
- **Google OAuth compromise**: Mitigated by token validation + staff email whitelist
- **Public URL exposure**: Mitigated by rate limiting + logging
- **Session token theft**: Mitigated by origin validation + short expiry

### 🔴 Consideration for Future
- **Advanced persistent threat**: Consider moving to Cloud Run
- **DDoS attack**: Consider using Google Cloud Armor
- **Account takeover**: Consider adding 2FA for staff accounts
- **Audit logging**: Consider storing logs in separate database

---

## Testing the Protections

### Test 1: Rate Limiting
```bash
# Make 20 requests quickly - should fail after 15
for i in {1..20}; do
  curl -X POST https://script.google.com/macros/s/.../exec \
    -d '{"action":"stats"}'
  echo "Request $i"
done
```
Expected: First 15 succeed, requests 16-20 fail with "Rate limit exceeded"

### Test 2: Origin Validation
```bash
# Make request from non-approved origin
curl -X POST https://script.google.com/macros/s/.../exec \
  -H "Referer: https://attacker.com/page" \
  -d '{"action":"stats"}'
```
Expected: Fails with "Unauthorized origin"

### Test 3: Session Expiry
```bash
# Wait 16 minutes after logging in, then make request
curl -X POST https://script.google.com/macros/s/.../exec \
  -d '{"action":"stats","sessionToken":"old-token-from-16min-ago"}'
```
Expected: Fails with "Staff session expired"

### Test 4: PIN Change
```bash
# Try old PIN after changing in Script Properties
curl -X POST https://script.google.com/macros/s/.../exec \
  -d '{"action":"login","pin":"3867","googleIdToken":"..."}'
```
Expected: Fails with "Invalid PIN"

---

## Security Checklist for Deployment

Before deploying enhanced Code.gs to production:

- [ ] Set STAFF_PIN in Script Properties (new PIN, not "3867")
- [ ] Set GOOGLE_CLIENT_ID in Script Properties
- [ ] Set STAFF_EMAILS in Script Properties (comma-separated)
- [ ] Set ALLOWED_ORIGINS to your GitHub Pages URL
- [ ] Test all 4 scenarios above
- [ ] Clear all cached data: Cache.clear()
- [ ] Monitor logs for 24 hours after deployment
- [ ] Brief staff on new login flow (PIN first, then Google)
- [ ] Have a rollback plan (keep old version deployed until stable)

---

## Questions?

Refer to:
- **SECURITY_ANALYSIS.md** - Why these issues exist
- **SECURITY_IMPLEMENTATION_GUIDE.md** - How to implement
- **google/Code.gs.security-enhanced** - The actual code

For questions about specific protections, check this document (Security: Attack Scenarios).
