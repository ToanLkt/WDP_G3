const mongoose = require('mongoose');

const repositorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    githubAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GithubAccount',
      default: null,
    },
    githubRepoId: {
      type: Number,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    fullName: {
      type: String,
      default: '',
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    htmlUrl: {
      type: String,
      default: '',
    },
    private: {
      type: Boolean,
      default: false,
    },
    fork: {
      type: Boolean,
      default: false,
    },
    language: {
      type: String,
      default: '',
      trim: true,
    },
    topics: {
      type: [String],
      default: [],
    },
    defaultBranch: {
      type: String,
      default: 'main',
      trim: true,
    },
    size: {
      type: Number,
      default: 0,
    },
    stargazersCount: {
      type: Number,
      default: 0,
    },
    forksCount: {
      type: Number,
      default: false,
    },
    openIssuesCount: {
      type: Number,
      default: 0,
    },
    pushedAt: {
      type: Date,
      default: null,
    },
    updatedAtGithub: {
      type: Date,
      default: null,
    },
    rawData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

repositorySchema.index({ userId: 1, githubRepoId: 1 }, { unique: true });

module.exports = mongoose.model('Repository', repositorySchema);
