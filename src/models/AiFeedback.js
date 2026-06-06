const mongoose = require('mongoose');

const aiFeedbackSchema = new mongoose.Schema(
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
    analysisSnapshotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AnalysisSnapshot',
      required: true,
    },
    githubRepoId: {
      type: Number,
      required: true,
    },
    repoName: {
      type: String,
      required: true,
      trim: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    projectType: {
      type: String,
      default: 'Unknown',
      trim: true,
    },
    careerDirection: {
      type: String,
      default: 'Generalist Software Engineer',
      trim: true,
    },
    summary: {
      type: String,
      default: '',
      trim: true,
    },
    strengthFeedback: {
      type: [String],
      default: [],
    },
    weaknessFeedback: {
      type: [String],
      default: [],
    },
    learningAdvice: {
      type: String,
      default: '',
      trim: true,
    },
    nextSteps: {
      type: [String],
      default: [],
    },
    recommendedTopics: {
      type: [String],
      default: [],
    },
    careerSuggestion: {
      type: String,
      default: '',
      trim: true,
    },
    portfolioAdvice: {
      type: String,
      default: '',
      trim: true,
    },
    riskNotes: {
      type: [String],
      default: [],
    },
    rawAiResponse: {
      type: Object,
      default: {},
    },
    promptVersion: {
      type: String,
      default: 'v1',
      trim: true,
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

aiFeedbackSchema.index({ userId: 1, repositoryId: 1 });
aiFeedbackSchema.index({ userId: 1, generatedAt: -1 });
aiFeedbackSchema.index({ analysisSnapshotId: 1 });

module.exports = mongoose.model('AiFeedback', aiFeedbackSchema);
