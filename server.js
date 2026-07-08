const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Directories
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

function sanitizePathSegment(value) {
  return String(value).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
}

// Database setup
const db = new sqlite3.Database(path.join(__dirname, 'fileserver.db'), (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

// Initialize database tables
function initializeDatabase() {
  db.serialize(() => {
    // Users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Upload protection password (single row)
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY,
        upload_password TEXT DEFAULT '1234',
        UNIQUE(id)
      )
    `, () => {
      db.get('SELECT id FROM settings WHERE id = 1', (err, row) => {
        if (!row) {
          const hashedPassword = bcrypt.hashSync('1234', 10);
          db.run('INSERT INTO settings (id, upload_password) VALUES (1, ?)', [hashedPassword]);
        }
      });
    });

    // Documents table
    db.run(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        originalname TEXT NOT NULL,
        description TEXT,
        size INTEGER,
        uploaded_by TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, () => {
      db.all('PRAGMA table_info(documents)', [], (err, columns) => {
        if (!err && Array.isArray(columns)) {
          const hasDescription = columns.some(col => col.name === 'description');
          if (!hasDescription) {
            db.run('ALTER TABLE documents ADD COLUMN description TEXT');
          }
        }
      });
    });

    // Create default admin user
    const username = 'admin';
    const password = bcrypt.hashSync('admin123', 10);
    db.run(
      'INSERT OR IGNORE INTO users (id, username, password) VALUES (1, ?, ?)',
      [username, password],
      (err) => {
        if (!err) {
          console.log('Default user created: admin / admin123');
        }
      }
    );
  });
}

// Middleware setup
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session setup
app.use(session({
  secret: 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 3600000 } // 1 hour
}));

// File upload setup
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const userFolderName = sanitizePathSegment(req.session.user?.username || 'guest');
      const userFolder = path.join(uploadDir, userFolderName);
      fs.mkdirSync(userFolder, { recursive: true });
      cb(null, userFolder);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  }),
  fileFilter: (req, file, cb) => {
    // Only allow Word documents
    const allowedTypes = [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith('.doc') || file.originalname.endsWith('.docx')) {
      cb(null, true);
    } else {
      cb(new Error('Only Word documents (.doc, .docx) are allowed'), false);
    }
  }
});

// Middleware to check authentication
const checkAuth = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
};

// Routes

// Login route
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (bcrypt.compareSync(password, user.password)) {
      req.session.user = { id: user.id, username: user.username };
      res.json({ success: true, message: 'Login successful' });
    } else {
      res.status(401).json({ error: 'Invalid username or password' });
    }
  });
});

// Logout route
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true, message: 'Logged out' });
  });
});

// Check authentication status
app.get('/api/check-auth', (req, res) => {
  if (req.session.user) {
    const isAdmin = req.session.user.username === 'admin';
    res.json({ authenticated: true, user: req.session.user, isAdmin });
  } else {
    res.json({ authenticated: false });
  }
});

// Create new user (admin only)
app.post('/api/users', checkAuth, (req, res) => {
  if (req.session.user.username !== 'admin') {
    return res.status(403).json({ error: 'Only admin can create users' });
  }

  const { username, password, email, role } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  db.run(
    'INSERT INTO users (username, password) VALUES (?, ?)',
    [username, hashedPassword],
    (err) => {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ error: 'Username already exists' });
        }
        return res.status(500).json({ error: 'Failed to create user' });
      }
      res.json({ success: true, message: 'User created successfully', username });
    }
  );
});

// Get all users (admin only)
app.get('/api/users', checkAuth, (req, res) => {
  if (req.session.user.username !== 'admin') {
    return res.status(403).json({ error: 'Only admin can view users' });
  }

  db.all('SELECT id, username, created_at FROM users ORDER BY created_at DESC', [], (err, users) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(users);
  });
});

// Upload document (requires password)
app.post('/api/upload', checkAuth, upload.single('document'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { uploadPassword, description } = req.body;

  if (!uploadPassword) {
    // Delete uploaded file if no password provided
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Upload password required' });
  }

  // Get upload password from database
  db.get('SELECT upload_password FROM settings WHERE id = 1', (err, settings) => {
    if (err) {
      fs.unlinkSync(req.file.path);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!bcrypt.compareSync(uploadPassword, settings.upload_password)) {
      fs.unlinkSync(req.file.path);
      return res.status(401).json({ error: 'Invalid upload password' });
    }

    const userFolderName = sanitizePathSegment(req.session.user.username);
    const storedFilename = path.join(userFolderName, req.file.filename);

    // Save file info to database
    db.run(
      'INSERT INTO documents (filename, originalname, description, size, uploaded_by) VALUES (?, ?, ?, ?, ?)',
      [storedFilename, req.file.originalname, description || '', req.file.size, req.session.user.username],
      (err) => {
        if (err) {
          fs.unlinkSync(req.file.path);
          return res.status(500).json({ error: 'Failed to save document info' });
        }

        res.json({
          success: true,
          message: 'Document uploaded successfully',
          file: {
            filename: storedFilename,
            originalname: req.file.originalname,
            description: description || '',
            size: req.file.size
          }
        });
      }
    );
  });
});

// Update current user password
app.post('/api/users/update-password', checkAuth, (req, res) => {
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.session.user.id], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to update user password' });
    }
    res.json({ success: true, message: 'User password updated successfully' });
  });
});

// Get all documents
app.get('/api/documents', checkAuth, (req, res) => {
  db.all('SELECT * FROM documents ORDER BY uploaded_at DESC', [], (err, documents) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(documents);
  });
});

// Download document
app.get('/api/download', checkAuth, (req, res) => {
  const filename = req.query.filename;
  if (!filename) {
    return res.status(400).json({ error: 'Filename required' });
  }

  const normalizedFilename = path.normalize(String(filename));
  if (path.isAbsolute(normalizedFilename) || normalizedFilename.includes('..')) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const filepath = path.join(uploadDir, normalizedFilename);

  if (!filepath.startsWith(uploadDir)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.download(filepath);
});

// Delete document (admin only)
app.delete('/api/documents/:id', checkAuth, (req, res) => {
  if (req.session.user.username !== 'admin') {
    return res.status(403).json({ error: 'Only admin can delete documents' });
  }

  const docId = req.params.id;

  db.get('SELECT filename FROM documents WHERE id = ?', [docId], (err, doc) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Delete file
    const filepath = path.join(uploadDir, doc.filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }

    // Delete from database
    db.run('DELETE FROM documents WHERE id = ?', [docId], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to delete document' });
      }
      res.json({ success: true, message: 'Document deleted' });
    });
  });
});

// Get current upload password (for admin)
app.get('/api/settings', checkAuth, (req, res) => {
  // In a real app, check if user is admin
  res.json({ uploadPasswordRequired: true });
});

// Update upload password
app.post('/api/settings/update-password', checkAuth, (req, res) => {
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  db.run('UPDATE settings SET upload_password = ? WHERE id = 1', [hashedPassword], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to update password' });
    }
    res.json({ success: true, message: 'Upload password updated' });
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`File server running at http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
