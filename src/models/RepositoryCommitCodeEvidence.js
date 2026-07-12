const mongoose = require('mongoose');

const RepositoryCommitCodeEvidenceSchema = new mongoose.Schema(
  {
    repositoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', required: true },
    sha: { type: String, required: true },
    filename: { type: String, required: true },
    status: { type: String, default: '' },
    additions: { type: Number, default: 0 },
    deletions: { type: Number, default: 0 },
    changes: { type: Number, default: 0 },
    evidenceSource: { type: String, default: 'path_only' },
    detectedLanguages: { type: [String], default: [] },
    detectedFrameworks: { type: [String], default: [] },
    detectedLibraries: { type: [String], default: [] },
    detectedPatterns: { type: [String], default: [] },
    detectedRoleSignals: { type: [String], default: [] },
    skillSignals: { type: [String], default: [] },
    contentHash: { type: String, default: '' },
    analyzedAt: { type: Date },
    evidenceVersion: { type: String, required: true },
    fileSelectionVersion: { type: String, required: true },
  },
  { timestamps: true }
);

RepositoryCommitCodeEvidenceSchema.index(
  { repositoryId: 1, sha: 1, filename: 1, evidenceVersion: 1 },
  { unique: true }
);
RepositoryCommitCodeEvidenceSchema.index({ repositoryId: 1, sha: 1, evidenceVersion: 1 });

module.exports = mongoose.model('RepositoryCommitCodeEvidence', RepositoryCommitCodeEvidenceSchema);
