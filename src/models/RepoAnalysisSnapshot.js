const mongoose = require('mongoose');

const scoresSchema = new mongoose.Schema(
  {
    techStackScore: { type: Number, default: 0 },
    documentationScore: { type: Number, default: 0 },
    commitQualityScore: { type: Number, default: 0 },
    deploymentScore: { type: Number, default: 0 },
    testingScore: { type: Number, default: 0 },
    portfolioReadinessScore: { type: Number, default: 0 },
    overallScore: { type: Number, default: 0 },
  },
  { _id: false }
);

const commitSummarySchema = new mongoose.Schema(
  {
    totalCommits: { type: Number, default: 0 },
    activeDays: { type: Number, default: 0 },
    vagueCommitRatio: { type: Number, default: 0 },
    conventionalCommitRatio: { type: Number, default: 0 },
    firstCommitDate: { type: Date, default: null },
    lastCommitDate: { type: Date, default: null },
  },
  { _id: false }
);

const checklistSchema = new mongoose.Schema(
  {
    hasReadme: { type: Boolean, default: false },
    hasEnvExample: { type: Boolean, default: false },
    hasDocker: { type: Boolean, default: false },
    hasDockerCompose: { type: Boolean, default: false },
    hasCICD: { type: Boolean, default: false },
    hasTesting: { type: Boolean, default: false },
    hasLinting: { type: Boolean, default: false },
    hasFormatter: { type: Boolean, default: false },
    hasPackageFile: { type: Boolean, default: false },
  },
  { _id: false }
);

const skillEvidenceSchema = new mongoose.Schema(
  {
    skill: { type: String, required: true, trim: true },
    canonicalSkillName: { type: String, required: true, trim: true },
    normalizedSkillName: { type: String, required: true, trim: true, lowercase: true },
    category: { type: String, default: 'General', trim: true },
    source: {
      type: String,
      enum: [
        'language',
        'framework',
        'package',
        'config',
        'skill_signal',
        'career_signal',
        'checklist',
        'score',
        'missing_signal',
        'inferred',
      ],
      required: true,
    },
    sourceValue: { type: String, default: '', trim: true },
    weight: { type: Number, default: 0, min: 0, max: 1 },
    confidence: { type: Number, default: 0, min: 0, max: 1 },
    note: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const skillVectorSchema = new mongoose.Schema(
  {
    skill: { type: String, required: true, trim: true },
    canonicalSkillName: { type: String, required: true, trim: true },
    normalizedSkillName: { type: String, required: true, trim: true, lowercase: true },
    category: { type: String, default: 'General', trim: true },
    score: { type: Number, default: 0, min: 0, max: 1 },
    level: {
      type: String,
      enum: ['missing', 'weak', 'developing', 'moderate', 'strong'],
      default: 'missing',
    },
    evidence: { type: [String], default: [] },
    sources: { type: [String], default: [] },
    similarity: { type: Number, default: null },
    dev2vecStatus: { type: String, default: '' },
    evidenceDetected: { type: Boolean, default: false },
    evidenceStatus: { type: String, default: '' },
    reason: { type: String, default: '', trim: true },
    lastCalculatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const repoAnalysisSnapshotSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    repositoryId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    githubRepoId: {
      type: Number,
    },
    repoName: {
      type: String,
      default: '',
    },
    fullName: {
      type: String,
      default: '',
    },
    analysisResultId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AnalysisSnapshot',
    },
    projectType: {
      type: String,
      default: 'Unknown',
    },
    careerDirection: {
      type: String,
      default: 'Generalist Software Engineer',
    },
    languages: { type: [String], default: [] },
    frameworks: { type: [String], default: [] },
    packages: { type: [String], default: [] },
    configs: { type: [String], default: [] },
    skillSignals: { type: [String], default: [] },
    careerSignals: { type: [String], default: [] },
    strengths: { type: [String], default: [] },
    weaknesses: { type: [String], default: [] },
    missingSkills: { type: [String], default: [] },
    recommendations: { type: [String], default: [] },
    scores: {
      type: scoresSchema,
      default: () => ({}),
    },
    summary: { type: Object, default: {} },
    analysisScope: { type: Object, default: {} },
    scoreBreakdown: { type: Object, default: {} },
    commitSummary: {
      type: commitSummarySchema,
      default: () => ({}),
    },
    checklist: {
      type: checklistSchema,
      default: () => ({}),
    },
    skillEvidence: { type: [skillEvidenceSchema], default: [] },
    skillVector: { type: [skillVectorSchema], default: [] },
    dev2vec: { type: Object, default: {} },
    analyzedAt: {
      type: Date,
      default: Date.now,
    },
    snapshotType: {
      type: String,
      enum: ['after_analysis', 'manual'],
      default: 'after_analysis',
    },
    source: {
      type: String,
      enum: ['github'],
      default: 'github',
    },
  },
  { timestamps: true }
);

repoAnalysisSnapshotSchema.index({ userId: 1, repositoryId: 1, createdAt: -1 });
repoAnalysisSnapshotSchema.index({ userId: 1, githubRepoId: 1, createdAt: -1 });
repoAnalysisSnapshotSchema.index({ analysisResultId: 1 });

module.exports = mongoose.model('RepoAnalysisSnapshot', repoAnalysisSnapshotSchema);
