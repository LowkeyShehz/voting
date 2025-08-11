// server.js - Node.js Express Server with MySQL - FIXED VERSION
require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MySQL Database Configuration - Using Environment Variables
const DB_NAME = process.env.DB_NAME || 'voting.db';
const db = new sqlite3.Database(DB_NAME, (err) => {
    if (err) {
        console.error('Could not connect to database', err);
    } else {
        console.log('Connected to SQLite database');
    }
});

// Initialize Database - FIXED VERSION
async function initializeDatabase() {
    try {
        // Create tables if they don't exist
        await new Promise((resolve, reject) => {
            db.run(`
                CREATE TABLE IF NOT EXISTS voters (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    password TEXT NOT NULL,
                    has_voted INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err); else resolve();
            });
        });
        
        await new Promise((resolve, reject) => {
            db.run(`
                CREATE TABLE IF NOT EXISTS candidates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    party TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err); else resolve();
            });
        });
        
        await new Promise((resolve, reject) => {
            db.run(`
                CREATE TABLE IF NOT EXISTS votes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    voter_id TEXT NOT NULL,
                    candidate_id INTEGER NOT NULL,
                    voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (voter_id) REFERENCES voters(id),
                    FOREIGN KEY (candidate_id) REFERENCES candidates(id),
                    UNIQUE (voter_id)
                )
            `, (err) => {
                if (err) reject(err); else resolve();
            });
        });
        
        await new Promise((resolve, reject) => {
            db.run(`
                CREATE TABLE IF NOT EXISTS admins (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL
                )
            `, (err) => {
                if (err) reject(err); else resolve();
            });
        });
        
        // Insert default admin if not exists
        const hashedAdminPassword = await bcrypt.hash('admin123', 10);
        await new Promise((resolve, reject) => {
            db.run(`
                INSERT OR IGNORE INTO admins (username, password) 
                VALUES ('admin', ?)
            `, [hashedAdminPassword], function(err) {
                if (err) reject(err); else resolve();
            });
        });
        
        // Insert sample voters if not exists
        const hashedPassword = await bcrypt.hash('password123', 10);
        await new Promise((resolve, reject) => {
            db.run(`
                INSERT OR IGNORE INTO voters (id, name, password) VALUES 
                ('V001', 'John Doe', ?),
                ('V002', 'Jane Smith', ?),
                ('V003', 'Bob Johnson', ?)
            `, [hashedPassword, hashedPassword, hashedPassword], function(err) {
                if (err) reject(err); else resolve();
            });
        });
        
        // Insert sample candidates if not exists
        await new Promise((resolve, reject) => {
            db.run(`
                INSERT OR IGNORE INTO candidates (name, party) VALUES 
                ('Alice Wilson', 'Democratic Party'),
                ('Robert Brown', 'Republican Party'),
                ('Carol Davis', 'Independent')
            `, function(err) {
                if (err) reject(err); else resolve();
            });
        });
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Database initialization error:', error);
    }
}

// API Routes

// Voter login
app.post('/api/login', async (req, res) => {
    try {
        const { voterId, password } = req.body;
        
        const voterData = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM voters WHERE id = ?', [voterId], (err, row) => {
                if (err) reject(err); else resolve(row);
            });
        });
        
        if (!voterData) { // Changed from !voter to !voterData
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // const voter = rows[0]; // This line is removed
        const isValidPassword = await bcrypt.compare(password, voterData.password); // Changed from voter.password to voterData.password
        
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        res.json({
            success: true,
            voter: {
                id: voterData.id, // Changed from voter.id to voterData.id
                name: voterData.name, // Changed from voter.name to voterData.name
                hasVoted: voterData.has_voted // Changed from voter.has_voted to voterData.has_voted
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin login
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const adminData = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM admins WHERE username = ?', [username], (err, row) => {
                if (err) reject(err); else resolve(row);
            });
        });
        
        if (!adminData) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        

        const isValidPassword = await bcrypt.compare(password, adminData.password);
        
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        res.json({ success: true, admin: { username: adminData.username } });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get candidates
app.get('/api/candidates', async (req, res) => {
    try {
        const candidates = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM candidates ORDER BY name', (err, rows) => {
                if (err) reject(err); else resolve(rows);
            });
        });
        
        res.json(candidates);
    } catch (error) {
        console.error('Get candidates error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Cast vote
app.post('/api/vote', async (req, res) => {
    try {
        const { voterId, candidateId } = req.body;
        
        // Check if voter has already voted
        const existingVote = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM votes WHERE voter_id = ?', [voterId], (err, row) => {
                if (err) reject(err); else resolve(row);
            });
        });
        
        if (existingVote.length > 0) {
            connection.release();
            return res.status(400).json({ error: 'You have already voted' });
        }
        
        // Record the vote
        await new Promise((resolve, reject) => {
            db.run('INSERT INTO votes (voter_id, candidate_id) VALUES (?, ?)', [voterId, candidateId], function(err) {
                if (err) reject(err); else resolve();
            });
        });
        
        // Mark voter as voted
        await new Promise((resolve, reject) => {
            db.run('UPDATE voters SET has_voted = 1 WHERE id = ?', [voterId], function(err) {
                if (err) reject(err); else resolve();
            });
        });
        res.json({ success: true, message: 'Vote cast successfully' });
    } catch (error) {
        console.error('Vote error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get results
app.get('/api/results', async (req, res) => {
    try {
        const results = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    c.id,
                    c.name,
                    c.party,
                    COUNT(v.candidate_id) as vote_count
                FROM candidates c
                LEFT JOIN votes v ON c.id = v.candidate_id
                GROUP BY c.id, c.name, c.party
                ORDER BY vote_count DESC, c.name
            `, (err, rows) => {
                if (err) reject(err); else resolve(rows);
            });
        });
        
        res.json(results);
    } catch (error) {
        console.error('Get results error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin: Get all voters
app.get('/api/admin/voters', async (req, res) => {
    try {
        const voters = await new Promise((resolve, reject) => {
            db.all('SELECT id, name, has_voted FROM voters ORDER BY name', (err, rows) => {
                if (err) reject(err); else resolve(rows);
            });
        });
        res.json(voters);
    } catch (error) {
        console.error('Get voters error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin: Add voter
app.post('/api/admin/voters', async (req, res) => {
    try {
        const { id, name, password } = req.body;
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        await new Promise((resolve, reject) => {
            db.run('INSERT INTO voters (id, name, password) VALUES (?, ?, ?)', [id, name, hashedPassword], function(err) {
                if (err) reject(err); else resolve();
            });
        });
        
        res.json({ success: true, message: 'Voter added successfully' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(400).json({ error: 'Voter ID already exists' });
        } else {
            console.error('Add voter error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }
});

// Admin: Remove voter
app.delete('/api/admin/voters/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Delete votes associated with the voter first
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM votes WHERE voter_id = ?', [id], function(err) {
                if (err) reject(err); else resolve();
            });
        });
        
        // Then delete the voter
        const result = await new Promise((resolve, reject) => {
            db.run('DELETE FROM voters WHERE id = ?', [id], function(err) {
                if (err) reject(err); else resolve(this.changes);
            });
        });
        
        if (result === 0) {
            return res.status(404).json({ error: 'Voter not found' });
        }
        
        res.json({ success: true, message: 'Voter removed successfully' });
    } catch (error) {
        console.error('Remove voter error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin: Add candidate
app.post('/api/admin/candidates', async (req, res) => {
    try {
        const { name, party } = req.body;
        await new Promise((resolve, reject) => {
            db.run('INSERT INTO candidates (name, party) VALUES (?, ?)', [name, party], function(err) {
                if (err) reject(err); else resolve();
            });
        });
        
        res.json({ success: true, message: 'Candidate added successfully' });
    } catch (error) {
        console.error('Add candidate error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin: Remove candidate
app.delete('/api/admin/candidates/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Delete votes for the candidate first
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM votes WHERE candidate_id = ?', [id], function(err) {
                if (err) reject(err); else resolve();
            });
        });
        
        // Then delete the candidate
        const result = await new Promise((resolve, reject) => {
            db.run('DELETE FROM candidates WHERE id = ?', [id], function(err) {
                if (err) reject(err); else resolve(this.changes);
            });
        });
        
        if (result === 0) {
            return res.status(404).json({ error: 'Candidate not found' });
        }
        
        res.json({ success: true, message: 'Candidate removed successfully' });
    } catch (error) {
        console.error('Remove candidate error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin: Reset election
app.post('/api/admin/reset', async (req, res) => {
    try {
        // Clear all votes
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM votes', function(err) {
                if (err) reject(err); else resolve();
            });
        });
        
        // Reset all voters' has_voted status
        await new Promise((resolve, reject) => {
            db.run('UPDATE voters SET has_voted = 0', function(err) {
                if (err) reject(err); else resolve();
            });
        });
        res.json({ success: true, message: 'Election reset successfully' });
    } catch (error) {
        console.error('Reset election error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Serve static files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
async function startServer() {
    await initializeDatabase();
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log('Default login credentials:');
        console.log('Admin - Username: admin, Password: admin123');
        console.log('Voters - ID: V001/V002/V003, Password: password123');
    });
}

startServer();