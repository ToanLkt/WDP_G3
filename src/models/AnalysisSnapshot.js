const mongoose = require('mongoose');

const analysisSnapshotSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    repositoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Repository',
      required: true,
    },
    githubRepoId: {
      type: Number,
      required: true,
    },
    repoName: {
      type: String,
      required: true,
    },
    fullName: {
      type: String,
      required: true,
    },
    analyzedAt: {
      type: Date,
      default: Date.now,
    },
    projectType: {
      type: String,
      default: 'Unknown',
    },
    languages: {
      type: [String],
      default: [],
    },
    frameworks: {
      type: [String],
      default: [],
    },
    packages: {
      type: [String],
      default: [],
    },
    configs: {
      type: [String],
      default: [],
    },
    skillSignals: {
      type: [String],
      default: [],
    },
    careerSignals: {
      type: [String],
      default: [],
    },
    careerDirection: {
      type: String,
      default: 'Generalist Software Engineer',
    },
    strengths: {
      type: [String],
      default: [],
    },
    weaknesses: {
      type: [String],
      default: [],
    },
    missingSkills: {
      type: [String],
      default: [],
    },
    recommendations: {
      type: [String],
      default: [],
    },
    scores: {
      type: Object,
      default: {},
    },
    commitSummary: {
      type: Object,
      default: {},
    },
    checklist: {
      type: Object,
      default: {},
    },
    rawAnalysis: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

analysisSnapshotSchema.index({ userId: 1, repositoryId: 1 });
analysisSnapshotSchema.index({ userId: 1, analyzedAt: -1 });

module.exports = mongoose.model('AnalysisSnapshot', analysisSnapshotSchema);
