const express = require('express');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// --- Google OAuth2 Configuration ---
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// Scopes define the level of access you are requesting.
const scopes = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events'
];

// In-memory token storage for demonstration.
// In a production app, you should use a secure database to store tokens.
let userTokens = null;

// --- Middleware to check for authentication ---
const isAuthenticated = (req, res, next) => {
  if (!userTokens) {
    return res.status(401).send('Unauthorized. Please authenticate by visiting /auth/google');
  }
  oauth2Client.setCredentials(userTokens);
  next();
};

// --- Routes ---

app.get('/', (req, res) => {
    res.send('Welcome to the Google Calendar API service! Visit /auth/google to authenticate.');
});

/**
 * Route to start the OAuth2 authentication process.
 * It generates an authentication URL and redirects the user to Google's consent screen.
 */
app.get('/auth/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline', // 'offline' gets a refresh token
    scope: scopes
  });
  res.redirect(url);
});

/**
 * The callback route that Google redirects to after user consent.
 * It exchanges the authorization code for access and refresh tokens.
 */
app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Authorization code not found.');
  }
  try {
    const { tokens } = await oauth2Client.getToken(code);
    userTokens = tokens; // Store tokens
    console.log('Tokens acquired:', userTokens);
    res.send('Authentication successful! You can now use the API endpoints.');
  } catch (error) {
    console.error('Error retrieving access token', error);
    res.status(500).send('Error retrieving access token.');
  }
});

/**
 * API endpoint to check the free/busy status of calendars.
 * Expects a POST request with a body like:
 * { "items": [{ "id": "user1@example.com" }, { "id": "user2@example.com" }] }
 */
app.post('/calendar/freebusy', isAuthenticated, async (req, res) => {
  const { items, timeMin, timeMax } = req.body;

  if (!items || !Array.isArray(items)) {
    return res.status(400).send('Invalid request body. "items" array is required.');
  }

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  try {
    const response = await calendar.freebusy.query({
      requestBody: {
        // Default to checking for the next 7 days if not provided
        timeMin: timeMin || (new Date()).toISOString(),
        timeMax: timeMax || (new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)).toISOString(),
        items: items,
      },
    });

    res.json(response.data.calendars);
  } catch (error) {
    console.error('The API returned an error: ' + error);
    res.status(500).send('Failed to query free/busy status.');
  }
});

/**
 * API endpoint to create a new event in the user's primary calendar.
 * Expects a POST request with event details in the body.
 * Example body:
 * {
 *   "summary": "Team Meeting",
 *   "description": "Discuss project updates.",
 *   "start": "2024-09-10T10:00:00-07:00",
 *   "end": "2024-09-10T11:00:00-07:00",
 *   "attendees": [{ "email": "attendee@example.com" }]
 * }
 */
app.post('/calendar/events', isAuthenticated, async (req, res) => {
  const { summary, description, start, end, attendees } = req.body;

  if (!summary || !start || !end) {
    return res.status(400).send('Missing required event fields: summary, start, end.');
  }

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const event = {
    summary: summary,
    description: description,
    start: {
      dateTime: start, // e.g., '2024-09-10T10:00:00-07:00'
      timeZone: 'America/Los_Angeles', // Adjust timezone as needed
    },
    end: {
      dateTime: end, // e.g., '2024-09-10T11:00:00-07:00'
      timeZone: 'America/Los_Angeles', // Adjust timezone as needed
    },
    attendees: attendees || [],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 },
        { method: 'popup', minutes: 10 },
      ],
    },
  };

  try {
    const response = await calendar.events.insert({
      calendarId: 'primary', // Use 'primary' for the user's main calendar
      resource: event,
      sendNotifications: true, // Send invitations to attendees
    });

    console.log('Event created: %s', response.data.htmlLink);
    res.status(201).json(response.data);
  } catch (error) {
    console.error('Error creating event: ' + error);
    res.status(500).send('Failed to create event.');
  }
});


app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`To authenticate, visit: http://localhost:${PORT}/auth/google`);
});
