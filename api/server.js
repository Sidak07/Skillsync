const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');
const multer = require('multer');
require('dotenv').config({ path: '../.env' });

const app = express();
const PORT = process.env.PORT || 3000;

// Database file path
const DB_FILE = path.join(__dirname, '../data/database.json');

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'hackathon-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Uploads folder for audio
const uploadsDir = path.join(__dirname, '../uploads');
if (!fssync.existsSync(uploadsDir)) {
    fssync.mkdirSync(uploadsDir, { recursive: true });
}
const upload = multer({ dest: uploadsDir });

// Initialize database
async function initDB() {
    try {
        await fs.access(DB_FILE);
    } catch {
        // Create database file if it doesn't exist
        const initialData = {
            users: [],
            jobs: [],
            tests: []
        };
        await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
        await fs.writeFile(DB_FILE, JSON.stringify(initialData, null, 2));
    }
}

// Database helpers
async function readDB() {
    const data = await fs.readFile(DB_FILE, 'utf8');
    return JSON.parse(data);
}

async function writeDB(data) {
    await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2));
}

// Authentication middleware
function requireAuth(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Generate AI questions (POST) - returns array of questions or 500
app.post('/api/generate-questions', async (req, res) => {
    try {
        const { type = 'all', count } = req.body || {};
        if (!process.env.GROQ_API_KEY) {
            return res.status(400).json({ error: 'groq not configured' });
        }
        const { generateQuestions } = require('./groq-question');
        const questions = await generateQuestions(type, count);
        res.json({ success: true, questions });
    } catch (error) {
        console.error('generate-questions error:', error);
        res.status(500).json({ success: false, error: 'Failed to generate questions' });
    }
});

// User registration
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        const db = await readDB();

        // Check if user already exists
        if (db.users.find(user => user.email === email)) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user
        const newUser = {
            id: uuidv4(),
            name,
            email,
            password: hashedPassword,
            role,
            scores: { aptitude: 0, technical: 0, communication: 0 },
            feedback: '',
            createdAt: new Date().toISOString()
        };

        db.users.push(newUser);
        await writeDB(db);

        // Set session
        req.session.userId = newUser.id;
        req.session.userRole = newUser.role;

        res.json({
            success: true,
            user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// User login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const db = await readDB();

        const user = db.users.find(u => u.email === email);
        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        req.session.userId = user.id;
        req.session.userRole = user.role;

        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Dev helper: demo login as first recruiter (only when not in production)
app.post('/api/demo-login', async (req, res) => {
    try {
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({ error: 'Not allowed in production' });
        }
        const db = await readDB();
        const recruiter = db.users.find(u => u.role === 'recruiter');
        if (!recruiter) return res.status(404).json({ error: 'No recruiter found in DB' });
        req.session.userId = recruiter.id;
        req.session.userRole = recruiter.role;
        res.json({ success: true, user: { id: recruiter.id, name: recruiter.name, email: recruiter.email, role: recruiter.role } });
    } catch (err) {
        console.error('Demo login error:', err);
        res.status(500).json({ error: 'Demo login failed' });
    }
});

// Get user profile
app.get('/api/profile', requireAuth, async (req, res) => {
    try {
        const db = await readDB();
        const user = db.users.find(u => u.id === req.session.userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            scores: user.scores,
            feedback: user.feedback
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

// Submit test results
app.post('/api/test-results', requireAuth, async (req, res) => {
    try {
        const { scores } = req.body;
        const db = await readDB();

        const userIndex = db.users.findIndex(u => u.id === req.session.userId);
        if (userIndex === -1) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update user scores
        db.users[userIndex].scores = scores;
        db.users[userIndex].lastTestDate = new Date().toISOString();

        // Generate AI feedback if OpenAI key is available
        let feedback = 'Great job on completing the assessment! Keep practicing to improve your skills.';

        if (process.env.GROQ_API_KEY) {
            try {
                const { generateFeedback } = require('./groq-feedback');
                feedback = await generateFeedback(scores);
            } catch (error) {
                console.error('AI feedback error:', error);
            }
        }

        db.users[userIndex].feedback = feedback;

        await writeDB(db);

        res.json({ success: true, feedback });
    } catch (error) {
        console.error('Test results error:', error);
        res.status(500).json({ error: 'Failed to save test results' });
    }
});

// Create job posting (recruiters only)
app.post('/api/jobs', requireAuth, async (req, res) => {
    try {
        if (req.session.userRole !== 'recruiter') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { title, company, description, requirements } = req.body;
        const db = await readDB();

        const newJob = {
            id: uuidv4(),
            title,
            company,
            description,
            requirements,
            recruiterId: req.session.userId,
            postedDate: new Date().toISOString(),
            status: 'active'
        };

        db.jobs.push(newJob);
        await writeDB(db);

        res.json({ success: true, job: newJob });
    } catch (error) {
        console.error('Job creation error:', error);
        res.status(500).json({ error: 'Failed to create job' });
    }
});

// Get jobs
app.get('/api/jobs', async (req, res) => {
    try {
        const db = await readDB();
        const jobs = db.jobs.filter(job => job.status === 'active');
        res.json(jobs);
    } catch (error) {
        console.error('Jobs error:', error);
        res.status(500).json({ error: 'Failed to get jobs' });
    }
});

// Get matching students (recruiters only)
app.get('/api/students', requireAuth, async (req, res) => {
    try {
        if (req.session.userRole !== 'recruiter') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { aptitude = 0, technical = 0, communication = 0 } = req.query;
        const db = await readDB();

        const matchingStudents = db.users
            .filter(user =>
                user.role === 'student' &&
                user.scores.aptitude >= parseInt(aptitude) &&
                user.scores.technical >= parseInt(technical) &&
                user.scores.communication >= parseInt(communication)
            )
            .map(user => ({
                id: user.id,
                name: user.name,
                email: user.email,
                scores: user.scores
            }))
            .sort((a, b) => {
                const aTotal = a.scores.aptitude + a.scores.technical + a.scores.communication;
                const bTotal = b.scores.aptitude + b.scores.technical + b.scores.communication;
                return bTotal - aTotal;
            });

        res.json(matchingStudents);
    } catch (error) {
        console.error('Students error:', error);
        res.status(500).json({ error: 'Failed to get students' });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Simple text transcript evaluator (no LLM) -> strict JSON
function evaluateTranscriptJSON(transcript) {
    const text = (transcript || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const tokens = text.split(' ').filter(Boolean);
    const words = tokens.filter(w => /[a-z']/i.test(w));
    const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    const unique = new Set(words.map(w => w.replace(/[^a-z']/gi, '')).filter(Boolean)).size;
    const vocabRichness = words.length ? unique / words.length : 0; // 0..1
    const avgSentenceLen = sentences.length ? words.length / sentences.length : words.length; // words per sentence
    // Filler detection with counts
    const fillerList = ['um', 'uh', 'like', 'you know', 'so', 'actually', 'basically', 'kinda', 'sort of'];
    const fillersFoundSet = new Set();
    let fillerCountTotal = 0;
    fillerList.forEach(f => {
        const re = new RegExp(`(^|\\b)${f.replace(/\s/g, '\\s+')}($|\\b)`, 'gi');
        const matches = text.match(re);
        if (matches && matches.length) { fillersFoundSet.add(f); fillerCountTotal += matches.length; }
    });
    const fillersFound = Array.from(fillersFoundSet);

    // Heuristic scores 0..100
    // Fluency target avg sentence length ~16-22 words
    const fluencyDelta = Math.abs((avgSentenceLen || 0) - 19);
    const fluency = Math.max(0, Math.min(100, 100 - fluencyDelta * 4));
    // Vocabulary richness scaled (type-token ratio)
    const vocab = Math.max(0, Math.min(100, vocabRichness * 200)); // ~0.5 -> 100
    // Filler penalty scaled by total count
    const fillerImpact = Math.min(100, fillerCountTotal * 7); // 0,7,14,...

    // Weighted overall
    let overall = (0.4 * fluency) + (0.4 * vocab) + (0.2 * (100 - fillerImpact));
    overall = Math.round(Math.max(0, Math.min(100, overall)));

    // Build 3-5 sentence feedback
    const feedbackParts = [];
    // Sentence 1: overall quality
    if (overall >= 85) feedbackParts.push('Your response is strong overall with clear structure and confident pacing.');
    else if (overall >= 70) feedbackParts.push('Your response is generally solid, though there are areas to refine for clarity and impact.');
    else feedbackParts.push('Your response needs clearer structure and delivery to communicate ideas effectively.');
    // Sentence 2: fluency
    if (fluency >= 80) feedbackParts.push('Fluency is good; sentence flow feels natural and easy to follow.');
    else if (avgSentenceLen < 12) feedbackParts.push('Many sentences are short; combine related ideas to improve flow.');
    else feedbackParts.push('Some sentences are long; break them into shorter units to improve readability.');
    // Sentence 3: vocabulary
    if (vocab >= 80) feedbackParts.push('Vocabulary is varied and precise, supporting your main points well.');
    else feedbackParts.push('Consider using more specific and topic-relevant terms to strengthen your arguments.');
    // Sentence 4: fillers
    if (fillerCountTotal > 0) feedbackParts.push(`Reduce filler words (${fillersFound.join(', ')}); pause briefly instead, which increases clarity.`);
    // Sentence 5: action
    feedbackParts.push('Practice by summarizing answers in 2–3 concise points, then expand with examples to balance depth and clarity.');

    const feedbackText = feedbackParts.slice(0, 5).join(' ');
    return {
        overall_score: overall,
        feedback_text: feedbackText,
        filler_words: fillersFound
    };
}

// LLM evaluator (more accurate) when API key is available
async function evaluateTranscriptLLM(transcript) {
    const Groq = require('groq-sdk');
    const groq = new Groq({ apiKey: process.env.OPENAI_API_KEY });
    const schemaHint = `{
    "overall_score": <integer 0-100>,
    "feedback_text": <string 3-5 sentences>,
    "filler_words": [<string>, ...]
  }`;
    const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        response_format: { type: 'json_object' },
        temperature: 0.2,
        messages: [
            {
                role: 'system',
                content: 'You are an Expert Speech Assessment System. Analyze the provided text transcription of a user\'s audio response and evaluate it against Fluency, Vocabulary, and Filler Words. Your output MUST be a valid JSON object that strictly adheres to the schema and contain no extra text.'
            },
            {
                role: 'user',
                content: `Transcript: ${transcript}\n\nEvaluation Criteria:\n- Overall Score (0-100): a single integer score reflecting the overall quality of the answer.\n- Feedback Text: a constructive paragraph (3-5 sentences) summarizing strengths and weaknesses across fluency, vocabulary, and filler words, with specific suggestions for improvement.\n- Filler Words: identify and list any common filler words (e.g., 'um', 'uh', 'like', 'you know', 'so').\n\nReturn ONLY JSON with keys: overall_score, feedback_text, filler_words. Example schema: ${schemaHint}`
            }
        ]
    });
    let text = completion.choices?.[0]?.message?.content || '';
    try {
        const parsed = JSON.parse(text);
        // Basic validation
        if (typeof parsed.overall_score !== 'number') parsed.overall_score = 0;
        if (typeof parsed.feedback_text !== 'string') parsed.feedback_text = '';
        if (!Array.isArray(parsed.filler_words)) parsed.filler_words = [];
        parsed.overall_score = Math.round(Math.max(0, Math.min(100, parsed.overall_score)));
        return parsed;
    } catch {
        return evaluateTranscriptJSON(transcript);
    }
}

// POST /api/text-evaluate -> receives { transcript } and returns strict JSON
app.post('/api/text-evaluate', async (req, res) => {
    try {
        const { transcript } = req.body || {};
        let result;
        if (process.env.OPENAI_API_KEY) {
            try { result = await evaluateTranscriptLLM(transcript || ''); }
            catch { result = evaluateTranscriptJSON(transcript || ''); }
        } else {
            result = evaluateTranscriptJSON(transcript || '');
        }
        res.json(result); // STRICT JSON only
    } catch (e) {
        res.status(500).json({ overall_score: 0, feedback_text: 'Error analyzing text', filler_words: [] });
    }
});

// POST /api/speech-transcribe -> audio upload to transcript only
app.post('/api/speech-transcribe', upload.single('audio'), async (req, res) => {
    try {
        const filePath = req.file?.path;
        if (!filePath) return res.status(400).json({ transcript: '' });

        let transcriptText = '';
        if (process.env.GROQ_API_KEY) {
            try {
                const Groq = require('groq-sdk');
                const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
                const response = await groq.audio.transcriptions.create({
                    file: fssync.createReadStream(filePath),
                    model: "whisper-large-v3"
                });
                transcriptText = response.text || '';
            } catch (err) {
                console.error('Groq transcription failed:', err);
                transcriptText = '';
            }
        }

        res.json({ transcript: transcriptText });
    } catch (e) {
        console.error('speech-transcribe error:', e);
        res.status(500).json({ transcript: '' });
    }
});

// Optional: direct audio -> evaluation (returns ONLY schema JSON)
app.post('/api/speech-evaluate', upload.single('audio'), async (req, res) => {
    try {
        const filePath = req.file?.path;
        if (!filePath) return res.status(400).json({ overall_score: 0, feedback_text: 'No audio received', filler_words: [] });

        let transcriptText = '';
        if (process.env.GROQ_API_KEY) {
            try {
                const Groq = require('groq-sdk');
                const groq = new Groq({ groqKey: process.env.GROQ_API_KEY });
                const response = await groq.audio.transcriptions.create({
                    file: fssync.createReadStream(filePath),
                    model: "whisper-large-v3"
                });
                transcriptText = response.text || '';
            } catch (err) {
                console.error('Groq transcription failed:', err);
                transcriptText = '';
            }
        }

        let result;
        if (process.env.GROQ_API_KEY) {
            try {
                result = await evaluateTranscriptLLM(transcriptText || '');
            } catch {
                result = evaluateTranscriptJSON(transcriptText || '');
            }
        } else {
            result = evaluateTranscriptJSON(transcriptText || '');
        }

        // Return ONLY the schema JSON
        res.json(result);
    } catch (e) {
        console.error('speech-evaluate error:', e);
        res.status(500).json({ overall_score: 0, feedback_text: 'Error processing audio', filler_words: [] });
    }
});

// Health endpoint so UI can adapt (e.g., warn if OpenAI is not configured)
app.get('/api/health', (req, res) => {
    res.json({ ok: true, groq: !!process.env.GROQ_API_KEY });
});

// Start server
initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 SkillSync Server running on http://localhost:${PORT}`);
        console.log(`🏠 Dashboard: http://localhost:${PORT}`);
        console.log(`📊 Student Dashboard: http://localhost:${PORT}/student.html`);
        console.log(`👔 Recruiter Dashboard: http://localhost:${PORT}/recruiter.html`);
        console.log(`📝 MCQ Test: http://localhost:${PORT}/test.html`);
    });
}).catch(console.error);