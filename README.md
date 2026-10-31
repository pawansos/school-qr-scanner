# School Registration Check-In

A no-build static web app for staff to check in event registrations after Google sign-in and PIN verification.

## Project layout

```text
index.html             GitHub Pages entry point
assets/css/styles.css
assets/js/app.js
assets/js/api.js
README.md
```

In GitHub, open **Settings > Pages** and select **Deploy from a branch**, branch `main`, folder `/(root)`, then save. Publish the static page and `assets/`; keep `google/Code.gs` in a private repository or otherwise out of the public Pages repository. The Apps Script source contains the staff PIN.

## Configure staff access

1. In Google Cloud Console, create a **Web application** OAuth client ID. Add the exact GitHub Pages origin (for example, `https://YOUR-USERNAME.github.io`) under **Authorized JavaScript origins**. Add `http://localhost:8080` for local testing if needed.
2. In Apps Script **Project Settings > Script Properties**, set `GOOGLE_CLIENT_ID` to that OAuth client ID and `STAFF_EMAILS` to a comma-separated allowlist of staff Google account emails.
3. Keep `STAFF_PIN` set to `3867` in `google/Code.gs`, then deploy as a web app with **Execute as: Me** and **Who has access: Anyone**. The API validates the Google token audience, account allowlist, PIN, and a short-lived server-cached session. API requests without a valid session are rejected.
4. Open the GitHub Pages URL. Enter the `/exec` Apps Script URL and the same OAuth client ID, select **Continue with Google**, finish Google sign-in, then enter the staff PIN.

Only allowlisted Google accounts can obtain a session. The PIN is deliberately fixed in source as requested; don't publish the Apps Script source in the public Pages repository. The session token is kept in page memory, expires within six hours (or when the Google token expires), and is cleared on sign-out or page reload.

## Run locally

Serve the repository root over HTTP; ES modules and camera access require an HTTP(S) origin.

```powershell
npx --yes http-server . -p 8080 -c-1
```

Open `http://localhost:8080`. Camera scanning requires a secure context, so use the deployed HTTPS GitHub Pages URL when testing on a phone. Local sign-in also requires `http://localhost:8080` in the OAuth client's authorized origins.