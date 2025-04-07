// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();

// ======================
// Middleware Configuration
// ======================
app.use(cors());

app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ======================
// Database Connection
// ======================
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  retryWrites: true,
  w: 'majority'
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  process.exit(1);
});

// ======================
// Data Models
// ======================
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const codeSnippetSchema = new mongoose.Schema({
  code: { type: String, required: true },
  language: { type: String, default: 'javascript' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

const feedbackSchema = new mongoose.Schema({
  codeSnippetId: { type: mongoose.Schema.Types.ObjectId, ref: 'CodeSnippet' },
  reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  feedbackText: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const CodeSnippet = mongoose.model('CodeSnippet', codeSnippetSchema);
const Feedback = mongoose.model('Feedback', feedbackSchema);

// ======================
// Authentication Middleware
// ======================
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided or malformed token' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error.message);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }

    res.status(401).json({ message: 'Not authorized' });
  }
};

// ======================
// API Routes
// ======================

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    timestamp: new Date().toISOString()
  });
});

// User Registration
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({ email, password: hashedPassword });

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Registration failed' });
  }
});

// User Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
});

// Code Submission (Protected)
app.post('/api/code', authenticate, async (req, res) => {
  try {
    const { code, language } = req.body;

    if (!code) {
      return res.status(400).json({ message: 'Code is required' });
    }

    const snippet = await CodeSnippet.create({
      code,
      language: language || 'javascript',
      userId: req.user._id
    });

    res.status(201).json(snippet);

  } catch (error) {
    console.error('Code submission error:', error);
    res.status(500).json({ message: 'Failed to submit code' });
  }
});

// Get Random Code (Protected)
app.get('/api/code/random', authenticate, async (req, res) => {
  try {
    const count = await CodeSnippet.countDocuments({ userId: { $ne: req.user._id } });

    if (count === 0) {
      return res.status(404).json({ message: 'No code available for review' });
    }

    const random = Math.floor(Math.random() * count);
    const snippet = await CodeSnippet.findOne({ userId: { $ne: req.user._id } }).skip(random);

    res.json(snippet);

  } catch (error) {
    console.error('Random code error:', error);
    res.status(500).json({ message: 'Failed to fetch random code' });
  }
});

app.get('/api/code/my-submissions', authenticate, async (req, res) => {
  try {
    const snippets = await CodeSnippet.find({ userId: req.user._id }).lean();
    const snippetIds = snippets.map(snippet => snippet._id);
    console.log(snippetIds);
    console.log(snippets);
    const feedbacks = await Feedback.find({ codeSnippetId: { $in: snippetIds } })
      .populate('reviewerId', 'email')
      .lean();

    const snippetsWithFeedback = snippets.map(snippet => ({
      ...snippet,
      feedbacks: feedbacks.filter(f => f.codeSnippetId.toString() === snippet._id.toString())
    }));

    res.json(snippetsWithFeedback);
  } catch (error) {
    console.error('Fetching submissions error:', error);
    res.status(500).json({ message: 'Failed to fetch submissions and feedback' });
  }
});

// Submit Feedback (Protected)
app.post('/api/feedback', authenticate, async (req, res) => {
  try {
    const { codeSnippetId, feedbackText } = req.body;

    if (!codeSnippetId || !feedbackText) {
      return res.status(400).json({ message: 'Code snippet ID and feedback text are required' });
    }

    const snippet = await CodeSnippet.findById(codeSnippetId);
    if (!snippet) {
      return res.status(404).json({ message: 'Code snippet not found' });
    }

    if (snippet.userId.toString() === req.user._id.toString()) {
      return res.status(403).json({ message: 'You cannot review your own code' });
    }

    const feedback = await Feedback.create({
      codeSnippetId,
      reviewerId: req.user._id,
      feedbackText,
    });

    res.status(201).json(feedback);
  } catch (error) {
    console.error('Feedback submission error:', error);
    res.status(500).json({ message: 'Failed to submit feedback' });
  }
});


// Protected Test Route
app.get('/api/protected', authenticate, (req, res) => {
  res.json({
    message: 'You have accessed a protected route',
    user: req.user
  });
});

// ======================
// Error Handling
// ======================
app.use((err, req, res, next) => {
  console.error('🔥 Server error:', err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// ======================
// Server Startup
// ======================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('- POST /api/auth/register');
  console.log('- POST /api/auth/login');
  console.log('- POST /api/code (protected)');
  console.log('- GET  /api/code/random (protected)');
  console.log('- GET  /api/code/my-submissions (protected)');
  console.log('- POST /api/feedback (protected)');
  console.log('- GET  /api/protected (protected)');
  console.log('- GET  /api/health\n');
});
