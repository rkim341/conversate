CONVERSATE: install as an app on your phone
===========================================
Folders (keep this exact structure at the top level of your GitHub repo):
  index.html, sw.js, manifest.webmanifest, whisper.js, whisper-worker.js
  fonts/   icons/   ort/   model/
GitHub's web uploader allows 25 MB per file (the largest here is 17 MB) and 100 files per upload.

1. Upload the CONTENTS of this folder to a GitHub repo (or Netlify Drop / Cloudflare Pages). It must be served over HTTPS.
2. Open the https link on your phone.
   - iPhone (Safari): Share > Add to Home Screen.
   - Android (Chrome): menu > Install app / Add to Home screen.
3. Launch from the home-screen icon: full screen, works offline.

Accurate filler detection: the first time you start a practice take, the app downloads a 63 MB speech model in the
background (do this on Wi-Fi). After each take it analyzes your recording on the phone to count ums and uhs.
Turn it off in Settings (tap the logo) > Filler Detection > Quick.

Updating: re-upload changed files; open the app twice to pick up the new version. If the old version persists,
delete the home-screen icon and add it again.
