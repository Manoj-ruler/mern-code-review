const express = require('express');
const router = express.Router();
const Code = require('../models/Code'); // assuming your model is named Code
const authMiddleware = require('../middleware/auth'); // to verify token

// Route to submit code
router.post('/', authMiddleware, async (req, res) => {
  const { code } = req.body;
  try {
    const newCode = new Code({
      user: req.user.id,
      code,
    });
    await newCode.save();
    res.status(201).json({ message: 'Code submitted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Route to get a random code snippet (not submitted by the user)
router.get('/random', authMiddleware, async (req, res) => {
  try {
    const snippets = await Code.find({ user: { $ne: req.user.id } });
    if (!snippets.length) return res.status(200).json({ code: null });
    const random = snippets[Math.floor(Math.random() * snippets.length)];
    res.json({ code: random.code, _id: random._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// 🔥 Route to get user's own code submissions
router.get('/mine', authMiddleware, async (req, res) => {
  try {
    const codes = await Code.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json({ codes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

module.exports = router;
