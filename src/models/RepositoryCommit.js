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
    branch: { type: String, default: '' },
    fetchStatus: { type: String, default: 'success' },
    matchedBy: { type: String, default: '' },
    additions: { type: Number, default: 0 },
    deletions: { type: Number, default: 0 },
    changedFiles: { type: Number, default: 0 },
    files: { type: [Object], default: [] },
    normalizedFiles: { type: [Object], default: undefined },
    codeEvidenceStatus: { type: String, default: '' },
    codeEvidenceAnalyzedAt: { type: Date },
    detailStatus: { type: String, default: '' },
    detailFetchedAt: { type: Date },
    detailErrorCode: { type: String, default: '' },
    rawData: { type: Object },
    lastFetchedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

RepositoryCommitSchema.index({ userId: 1, repositoryId: 1, sha: 1 }, { unique: true });
RepositoryCommitSchema.index({ repositoryId: 1, sha: 1 });
RepositoryCommitSchema.index({ userId: 1, repositoryId: 1, branch: 1, lastFetchedAt: -1 });

module.exports = mongoose.model('RepositoryCommit', RepositoryCommitSchema);
