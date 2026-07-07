const mongoose = require('mongoose');

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
      enum: ['missing', 'weak', 'developing', 'strong'],
      default: 'missing',
    },
    evidence: { type: [String], default: [] },
    sources: { type: [String], default: [] },
    lastCalculatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const analysisResultSchema = new mongoose.Schema(
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
    githubRepoId: { type: Number, required: true },
    repoName: { type: String, required: true },
    fullName: { type: String, required: true },
    analyzedAt: { type: Date, default: Date.now },
    projectType: { type: String, default: 'Unknown' },
    languages: { type: [String], default: [] },
    frameworks: { type: [String], default: [] },
    packages: { type: [String], default: [] },
    configs: { type: [String], default: [] },
    skillSignals: { type: [String], default: [] },
    careerSignals: { type: [String], default: [] },
    careerDirection: { type: String, default: 'Generalist Software Engineer' },
    strengths: { type: [String], default: [] },
    weaknesses: { type: [String], default: [] },
    missingSkills: { type: [String], default: [] },
    recommendations: { type: [String], default: [] },
    scores: { type: Object, default: {} },
    summary: { type: Object, default: {} },
    analysisScope: { type: Object, default: {} },
    scoreBreakdown: { type: Object, default: {} },
    commitSummary: { type: Object, default: {} },
    checklist: { type: Object, default: {} },
    rawAnalysis: { type: Object, default: {} },
    skillEvidence: { type: [skillEvidenceSchema], default: [] },
    skillVector: { type: [skillVectorSchema], default: [] },
    dev2vec: { type: Object, default: {} },
  },
  {
    timestamps: true,
    collection: 'analysissnapshots',
  }
);

analysisResultSchema.index({ userId: 1, repositoryId: 1 });
analysisResultSchema.index({ userId: 1, analyzedAt: -1 });

module.exports =
  mongoose.models.AnalysisResult ||
  mongoose.model('AnalysisResult', analysisResultSchema);
