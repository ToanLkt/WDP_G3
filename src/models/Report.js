const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['user', 'repository', 'analysis', 'ai_feedback', 'roadmap', 'other'],
      default: 'other',
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'IN_REVIEW', 'RESOLVED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    adminNote: {
      type: String,
      default: '',
      trim: true,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

reportSchema.virtual('reporterId').get(function getReporterId() {
  return this.userId;
});

reportSchema.virtual('targetType').get(function getTargetType() {
  return this.type;
});

reportSchema.set('toJSON', { virtuals: true });
reportSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Report', reportSchema);
