// server.js - Node.js Express Server with MySQL - FIXED VERSION
require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const mysql = require('mysql2/promise');
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
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'voting_user',
    password: process.env.DB_PASSWORD || '1234',
    database: process.env.DB_NAME || 'voting_system'
};

// Database connection pool
const pool = mysql.createPool(dbConfig);

// Initialize Database - FIXED VERSION
async function initializeDatabase() {
    try {
        // Connect directly to the existing database
        const connection = await pool.getConnection();
        
        // Create tables if they don't exist
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS voters (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                password VARCHAR(255) NOT NULL,
                has_voted BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS candidates (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                party VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS votes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                voter_id VARCHAR(50) NOT NULL,
                candidate_id INT NOT NULL,
                voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (voter_id) REFERENCES voters(id),
                FOREIGN KEY (candidate_id) REFERENCES candidates(id),
                UNIQUE KEY unique_vote (voter_id)
            )
        `);
        
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS admins (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL
            )
        `);
        
        // Insert default admin if not exists
        const hashedAdminPassword = await bcrypt.hash('admin123', 10);
        await connection.execute(`
            INSERT IGNORE INTO admins (username, password) 
            VALUES ('admin', ?)
        `, [hashedAdminPassword]);
        
        // Insert sample voters if table is empty
        const [votersCount] = await connection.execute('SELECT COUNT(*) as count FROM voters');
        if (votersCount[0].count === 0) {
            const hashedPassword = await bcrypt.hash('password123', 10);
            await connection.execute(`
                INSERT INTO voters (id, name, password) VALUES 
                ('V001', 'John Doe', ?),
                ('V002', 'Jane Smith', ?),
                ('V003', 'Bob Johnson', ?)
            `, [hashedPassword, hashedPassword, hashedPassword]);
        }
        
        // Insert sample candidates if table is empty
        const [candidatesCount] = await connection.execute('SELECT COUNT(*) as count FROM candidates');
        if (candidatesCount[0].count === 0) {
            await connection.execute(`
                INSERT INTO candidates (name, party) VALUES 
                ('Alice Wilson', 'Democratic Party'),
                ('Robert Brown', 'Republican Party'),
                ('Carol Davis', 'Independent')
            `);
        }
        
        connection.release();
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
        
        const connection = await pool.getConnection();
        const [rows] = await connection.execute(
            'SELECT * FROM voters WHERE id = ?',
            [voterId]
        );
        connection.release();
        
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const voter = rows[0];
        const isValidPassword = await bcrypt.compare(password, voter.password);
        
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        res.json({
            success: true,
            voter: {
                id: voter.id,
                name: voter.name,
                hasVoted: voter.has_voted
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
        
        const connection = await pool.getConnection();
        const [rows] = await connection.execute(
            'SELECT * FROM admins WHERE username = ?',
            [username]
        );
        connection.release();
        
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const admin = rows[0];
        const isValidPassword = await bcrypt.compare(password, admin.password);
        
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        res.json({ success: true, admin: { username: admin.username } });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get candidates
app.get('/api/candidates', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.execute('SELECT * FROM candidates ORDER BY name');
        connection.release();
        
        res.json(rows);
    } catch (error) {
        console.error('Get candidates error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Cast vote
app.post('/api/vote', async (req, res) => {
    try {
        const { voterId, candidateId } = req.body;
        
        const connection = await pool.getConnection();
        
        // Check if voter has already voted
        const [existingVote] = await connection.execute(
            'SELECT * FROM votes WHERE voter_id = ?',
            [voterId]
        );
        
        if (existingVote.length > 0) {
            connection.release();
            return res.status(400).json({ error: 'You have already voted' });
        }
        
        // Insert vote
        await connection.execute(
            'INSERT INTO votes (voter_id, candidate_id) VALUES (?, ?)',
            [voterId, candidateId]
        );
        
        // Update voter status
        await connection.execute(
            'UPDATE voters SET has_voted = TRUE WHERE id = ?',
            [voterId]
        );
        
        connection.release();
        res.json({ success: true, message: 'Vote cast successfully' });
    } catch (error) {
        console.error('Vote error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get results
app.get('/api/results', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.execute(`
            SELECT 
                c.id,
                c.name,
                c.party,
                COUNT(v.candidate_id) as vote_count
            FROM candidates c
            LEFT JOIN votes v ON c.id = v.candidate_id
            GROUP BY c.id, c.name, c.party
            ORDER BY vote_count DESC, c.name
        `);
        connection.release();
        
        res.json(rows);
    } catch (error) {
        console.error('Get results error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin: Get all voters
app.get('/api/admin/voters', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.execute(
            'SELECT id, name, has_voted, created_at FROM voters ORDER BY name'
        );
        connection.release();
        
        res.json(rows);
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
        
        const connection = await pool.getConnection();
        await connection.execute(
            'INSERT INTO voters (id, name, password) VALUES (?, ?, ?)',
            [id, name, hashedPassword]
        );
        connection.release();
        
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
        
        const connection = await pool.getConnection();
        
        // Delete votes first (foreign key constraint)
        await connection.execute('DELETE FROM votes WHERE voter_id = ?', [id]);
        
        // Delete voter
        await connection.execute('DELETE FROM voters WHERE id = ?', [id]);
        
        connection.release();
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
        
        const connection = await pool.getConnection();
        await connection.execute(
            'INSERT INTO candidates (name, party) VALUES (?, ?)',
            [name, party]
        );
        connection.release();
        
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
        
        const connection = await pool.getConnection();
        
        // Delete votes first (foreign key constraint)
        await connection.execute('DELETE FROM votes WHERE candidate_id = ?', [id]);
        
        // Delete candidate
        await connection.execute('DELETE FROM candidates WHERE id = ?', [id]);
        
        connection.release();
        res.json({ success: true, message: 'Candidate removed successfully' });
    } catch (error) {
        console.error('Remove candidate error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin: Reset election
app.post('/api/admin/reset', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        
        // Delete all votes
        await connection.execute('DELETE FROM votes');
        
        // Reset voter status
        await connection.execute('UPDATE voters SET has_voted = FALSE');
        
        connection.release();
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