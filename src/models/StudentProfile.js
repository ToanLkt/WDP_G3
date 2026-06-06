const mongoose = require('mongoose');

const studentProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    university: {
      type: String,
      trim: true,
      default: '',
    },
    major: {
      type: String,
      trim: true,
      default: '',
    },
    year: {
      type: Number,
      default: null,
      min: 1,
      max: 6,
    },
    targetCareer: {
      type: String,
      trim: true,
      default: '',
    },
    currentSkills: {
      type: [String],
      default: [],
    },
    githubUsername: {
      type: String,
      trim: true,
      default: '',
    },
    githubConnected: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('StudentProfile', studentProfileSchema);
