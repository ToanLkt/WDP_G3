const mongoose = require('mongoose');

const RepositoryCommitSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    repositoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', required: true },
    githubRepoId: { type: Number, required: true },
    fullName: { type: String, required: true },
    sha: { type: String, required: true },
    message: { type: String, default: '' },
    authorName: { type: String, default: '' },
    authorEmail: { type: String, default: '' },
    authorDate: { type: Date },
    committerName: { type: String, default: '' },
    committerDate: { type: Date },
    htmlUrl: { type: String },
    additions: { type: Number, default: 0 },
    deletions: { type: Number, default: 0 },
    changedFiles: { type: Number, default: 0 },
    files: { type: [Object], default: [] },
    rawData: { type: Object },
    lastFetchedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

RepositoryCommitSchema.index({ userId: 1, repositoryId: 1, sha: 1 }, { unique: true });

module.exports = mongoose.model('RepositoryCommit', RepositoryCommitSchema);
