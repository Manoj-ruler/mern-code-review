const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  feedbackText: String,
  reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const codeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  code: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  feedbacks: [feedbackSchema]
});

module.exports = mongoose.model('Code', codeSchema);
