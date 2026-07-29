const mongoose = require('mongoose');

const roadmapResourceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: '',
      trim: true,
    },
    type: {
      type: String,
      default: '',
      trim: true,
    },
    url: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: false }
);

const roadmapTaskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    skillTags: {
      type: [String],
      default: [],
    },
    skillName: { type: String, default: '', trim: true },
    canonicalSkillName: { type: String, default: '', trim: true },
    category: { type: String, default: 'General', trim: true },
    itemId: { type: String, default: '', trim: true },
    prerequisites: { type: [String], default: [] },
    level: { type: String, default: '', trim: true },
    week: { type: Number, default: 1 },
    priority: { type: mongoose.Schema.Types.Mixed, default: 'medium' },
    targetRole: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed'],
      default: 'not_started',
    },
    estimatedHours: {
      type: Number,
      default: 0,
    },
    resources: {
      type: [roadmapResourceSchema],
      default: [],
    },
  },
  { _id: true }
);

const roadmapPhaseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    goal: {
      type: String,
      default: '',
    },
    skills: {
      type: [String],
      default: [],
    },
    tasks: {
      type: [roadmapTaskSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed'],
      default: 'not_started',
    },
  },
  { _id: true }
);

const supportingPathSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    reason: {
      type: String,
      default: '',
    },
    skills: {
      type: [String],
      default: [],
    },
    suggestedTasks: {
      type: [String],
      default: [],
    },
  },
  { _id: true }
);

const roadmapSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    repositoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Repository',
      default: null,
    },
    targetRole: {
      type: String,
      required: true,
      trim: true,
    },
    roleId: { type: String, default: '', trim: true },
    requestedLevel: { type: String, default: '', trim: true },
    effectiveLevel: { type: String, default: '', trim: true },
    durationWeeks: { type: Number, default: 6 },
    language: { type: String, default: 'vi', trim: true },
    currentGithubDirection: {
      type: String,
      default: '',
    },
    summary: {
      type: String,
      default: '',
    },
    mainPath: {
      title: {
        type: String,
        default: '',
      },
      reason: {
        type: String,
        default: '',
      },
      phases: {
        type: [roadmapPhaseSchema],
        default: [],
      },
    },
    mainRoadmap: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    supportingPaths: {
      type: [supportingPathSchema],
      default: [],
    },
    alternativeRoadmaps: { type: [mongoose.Schema.Types.Mixed], default: [] },
    sourceContextSummary: {
      repositoriesCount: {
        type: Number,
        default: 0,
      },
      detectedSkills: {
        type: [String],
        default: [],
      },
      missingSkills: {
        type: [String],
        default: [],
      },
      latestAnalysisSnapshotId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AnalysisSnapshot',
        default: null,
      },
    },
    roadmapSource: { type: mongoose.Schema.Types.Mixed, default: 'legacy' },
    roleMatch: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    skillGapSummary: { type: mongoose.Schema.Types.Mixed, default: () => [] },
    progressSummary: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Roadmap', roadmapSchema);
