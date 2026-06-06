const mongoose = require('mongoose');

const githubAccountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    githubId: {
      type: Number,
      required: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
    },
    displayName: {
      type: String,
      default: '',
    },
    avatarUrl: {
      type: String,
      default: '',
    },
    profileUrl: {
      type: String,
      default: '',
    },
    accessToken: {
      type: String,
      required: true,
      select: false,
      // TODO: encrypt accessToken before production.
    },
    tokenType: {
      type: String,
      default: 'bearer',
    },
    scope: {
      type: String,
      default: '',
    },
    connectedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('GithubAccount', githubAccountSchema);
