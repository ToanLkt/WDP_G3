const mongoose = require('mongoose');

const RepositoryPackageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    repositoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', required: true },
    githubRepoId: { type: Number, required: true },
    fullName: { type: String, required: true },
    detectedFiles: {
      type: [Object],
      default: [],
    },
    packageFiles: {
      type: [String],
      default: [],
    },
    packages: {
      type: [String],
      default: [],
    },
    frameworks: {
      type: [String],
      default: [],
    },
    languages: {
      type: [String],
      default: [],
    },
    configs: {
      type: [String],
      default: [],
    },
    rawData: {
      type: Object,
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

RepositoryPackageSchema.index({ userId: 1, repositoryId: 1 }, { unique: true });

module.exports = mongoose.model('RepositoryPackage', RepositoryPackageSchema);
