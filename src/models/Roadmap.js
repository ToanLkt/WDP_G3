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
    targetRole: {
      type: String,
      required: true,
      trim: true,
    },
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
    supportingPaths: {
      type: [supportingPathSchema],
      default: [],
    },
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
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Roadmap', roadmapSchema);
