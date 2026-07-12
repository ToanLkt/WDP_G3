const mongoose = require('mongoose');

const RepositoryIssueSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    repositoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', required: true },
    githubRepoId: { type: Number, required: true },
    fullName: { type: String, required: true },
    issues: { type: [Object], default: [] },
    metadata: {
      type: Object,
      default: {},
    },
    lastFetchedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

RepositoryIssueSchema.index({ userId: 1, repositoryId: 1 }, { unique: true });

module.exports = mongoose.model('RepositoryIssue', RepositoryIssueSchema);
