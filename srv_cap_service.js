const cds = require('@sap/cds');
const { google } = require('googleapis');
require('dotenv').config();

// --- OAuth2 Client Configuration ---
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = [
    'https://www.googleapis.com/auth/calendar'
];

// In-memory token storage (for demo purposes)
let userTokens = null;

class calendar extends cds.ApplicationService {
  init() {

    // CAP action: say()
    this.on('say', async () => {
      return "hello";
    });

    // Step 1: authGoogle action (generate URL)
    this.on('authGoogle', async (req) => {
      const res = req._.res; // raw Express response
      console.log("[authGoogle] Starting auth flow...");
      const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES
      });
      console.log("[authGoogle] Redirect URL:", url);
      res.redirect(url);   // Browser redirect
      return null;         // CAP requires a return value
    });

    // Step 2: authGoogleCallback action (exchange code for tokens)
    this.on('authGoogleCallback', async (req) => {
      const res = req._.res;
      const { code } = req.data;
      console.log("[authGoogleCallback] Received code:", code);

      if (!code) {
        res.status(400).send('Authorization code not found.');
        return null;
      }

      try {
        const { tokens } = await oauth2Client.getToken(code);
        userTokens = tokens;
        oauth2Client.setCredentials(tokens);
        console.log("[authGoogleCallback] Tokens acquired:", tokens);
        res.send('✅ Authentication successful! You can now call /checkFreeBusy');
      } catch (err) {
        console.error("[authGoogleCallback] Error retrieving tokens:", err);
        res.status(500).send('Error retrieving access token.');
      }
      return null;
    });

    // CAP action: checkFreeBusy
    this.on('checkFreeBusy', async (req) => {
      if (!userTokens) {
        console.warn("[checkFreeBusy] User not authenticated yet.");
        return 'Not authenticated. Call /auth/google first!';
      }

      try {
        const calendarAPI = google.calendar({ version: 'v3', auth: oauth2Client });
        const response = await calendarAPI.freebusy.query({
          requestBody: {
            timeMin: req.data.timeMin,
            timeMax: req.data.timeMax,
            items: req.data.items
          }
        });
        console.log("[checkFreeBusy] Google API response:", response.data);
        return JSON.stringify(response.data, null, 2);
      } catch (error) {
        console.error("[checkFreeBusy] Error calling Calendar API:", error);
        return `Error: ${error.message}`;
      }
    });

    return super.init();
  }
}
module.exports = calendar;
// cds.on('bootstrap', app => {
//   // Use a dedicated route prefix for OAuth
//   const oauthRoot = '/auth/google';

//   // Step 1: Redirect user to Google login
//   app.get(`${oauthRoot}`, (req, res) => {
//     const url = oauth2Client.generateAuthUrl({
//       access_type: 'offline',
//       scope: SCOPES
//     });
//     console.log("[authGoogle] Redirecting to Google:", url);
//     res.redirect(url);
//   });

//   // Step 2: OAuth callback
//   app.get(`${oauthRoot}/callback`, async (req, res) => {
//     try {
//       const { code } = req.query;
//       if (!code) return res.status(400).send('Authorization code not found.');

//       const { tokens } = await oauth2Client.getToken(code);
//       userTokens = tokens;
//       oauth2Client.setCredentials(tokens);
//       console.log("[authGoogleCallback] Tokens acquired:", tokens);
//       res.send('✅ Authentication successful! You can now call /checkFreeBusy');
//     } catch (err) {
//       console.error("[authGoogleCallback] Error getting tokens:", err);
//       res.status(500).send('Error retrieving access token.');
//     }
//   });
// });

// module.exports = calendar;
