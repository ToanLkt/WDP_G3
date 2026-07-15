const mongoose = require('mongoose');

const chatSessionSchema = new mongoose.Schema(
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
      index: true,
    },
    roadmapId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Roadmap',
      default: null,
      index: true,
    },
    analysisId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AnalysisResult',
      default: null,
      index: true,
    },
    snapshotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RepoAnalysisSnapshot',
      default: null,
      index: true,
    },
    contextSelectionReason: {
      type: String,
      default: '',
      trim: true,
    },
    contextPinnedAt: {
      type: Date,
      default: null,
    },
    contextPinnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    title: {
      type: String,
      default: 'New GitHub Mentor Chat',
      trim: true,
    },
    lastMessage: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['active', 'waiting_admin', 'answered', 'closed'],
      default: 'active',
      index: true,
    },
    mode: {
      type: String,
      enum: ['AI_AUTO', 'MANUAL'],
      default: 'AI_AUTO',
      index: true,
    },
    modeSource: {
      type: String,
      enum: ['GLOBAL', 'SESSION'],
      default: 'GLOBAL',
      index: true,
    },
    assignedAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    aiPausedAt: {
      type: Date,
      default: null,
    },
    aiPausedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    manualReason: {
      type: String,
      default: '',
      trim: true,
    },
    unreadByAdmin: {
      type: Boolean,
      default: false,
    },
    unreadByUser: {
      type: Boolean,
      default: false,
    },
    lastMessageAt: {
      type: Date,
      default: null,
      index: true,
    },
    lastResponseAt: {
      type: Date,
      default: null,
      index: true,
    },
    userDeletedAt: {
      type: Date,
      default: null,
      index: true,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    closedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    closeReason: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

chatSessionSchema.index({ userId: 1, repositoryId: 1 });
chatSessionSchema.index({ userId: 1, roadmapId: 1 });
chatSessionSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.model('ChatSession', chatSessionSchema);
