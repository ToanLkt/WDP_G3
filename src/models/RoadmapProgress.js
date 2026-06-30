const mongoose = require('mongoose');

const roadmapProgressItemSchema = new mongoose.Schema(
  {
    itemId: {
      type: String,
      trim: true,
    },
    skillName: {
      type: String,
      trim: true,
    },
    title: {
      type: String,
      trim: true,
    },
    canonicalSkillName: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
    },
    targetRole: {
      type: String,
      trim: true,
    },
    level: {
      type: String,
      trim: true,
    },
    priority: {
      type: String,
      trim: true,
    },
    normalizedSkillName: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed'],
      default: 'not_started',
    },
    progressPercent: {
      type: Number,
      default: 0,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    updatedAt: {
      type: Date,
    },
  },
  { _id: false }
);

const roadmapProgressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    roadmapId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Roadmap',
      required: true,
    },
    items: {
      type: [roadmapProgressItemSchema],
      default: [],
    },
    overallProgress: {
      type: Number,
      default: 0,
    },
    progressSummary: {
      type: Object,
      default: () => ({
        totalItems: 0,
        completedItems: 0,
        inProgressItems: 0,
        overallProgress: 0,
      }),
    },
  },
  { timestamps: true }
);

roadmapProgressSchema.index({ userId: 1, roadmapId: 1 }, { unique: true });

module.exports = mongoose.model('RoadmapProgress', roadmapProgressSchema);
