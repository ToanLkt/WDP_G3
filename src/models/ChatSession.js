const mongoose = require('mongoose');

const chatSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
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
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('ChatSession', chatSessionSchema);
