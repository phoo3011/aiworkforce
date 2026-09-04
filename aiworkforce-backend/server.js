const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// Initialize Express App
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin SDK
// This requires a local serviceAccountKey.json file containing the Firebase project credentials
try {
  const serviceAccount = require('./serviceAccountKey.json');
  initializeApp({
    credential: cert(serviceAccount)
  });
  console.log('Firebase Admin initialized successfully.');
} catch (error) {
  console.error('Error initializing Firebase Admin (Ensure serviceAccountKey.json exists):', error.message);
}

// Initialize SQLite Database
// Connect to database.sqlite or create it if it doesn't exist
const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) {
    console.error('Error connecting to the SQLite database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    
    // Automatically create the students table if it doesn't exist
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        is_paid INTEGER DEFAULT 0
      )
    `;
    db.run(createTableQuery, (err) => {
      if (err) {
        console.error('Error creating students table:', err.message);
      } else {
        console.log('Students table is ready.');
      }
    });
  }
});

// Authentication API Endpoint
// Verifies Firebase ID Token and checks if the user is authorized in the database
app.post('/api/verify-token', async (req, res) => {
  const { idToken } = req.body;

  // Check if idToken was provided in the request body
  if (!idToken) {
    return res.status(401).json({
      authorized: false,
      message: 'No ID token provided.'
    });
  }

  try {
    // Verify the ID token using Firebase Admin SDK
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const userEmail = decodedToken.email;

    if (!userEmail) {
      return res.status(401).json({
        authorized: false,
        message: 'No email associated with this token.'
      });
    }

    // Query the database to see if the user exists
    const query = 'SELECT email, is_paid FROM students WHERE email = ?';
    db.get(query, [userEmail], (err, row) => {
      if (err) {
        console.error('Database query error:', err.message);
        return res.status(500).json({
          authorized: false,
          message: 'Internal server error during database query.'
        });
      }

      // If no matching student is found in the database
      if (!row) {
        return res.status(403).json({
          authorized: false,
          message: 'Access denied: User is not registered in the system.'
        });
      }

      // If student is found, return successful authorization
      return res.status(200).json({
        authorized: true,
        email: row.email,
        isPaid: row.is_paid,
        message: 'Successfully authorized.'
      });
    });

  } catch (error) {
    console.error('Token verification error:', error.message);
    
    // If Firebase throws an error, it is likely an invalid or expired token
    return res.status(401).json({
      authorized: false,
      message: 'Unauthorized: Invalid or expired ID token.'
    });
  }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
