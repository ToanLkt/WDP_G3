const mongoose = require('mongoose');

const reportStatusLogSchema = new mongoose.Schema(
  {
    reportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Report',
      required: true,
      index: true,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    fromStatus: {
      type: String,
      enum: ['PENDING', 'IN_REVIEW', 'RESOLVED', 'REJECTED'],
      default: null,
    },
    toStatus: {
      type: String,
      enum: ['PENDING', 'IN_REVIEW', 'RESOLVED', 'REJECTED'],
      required: true,
    },
    adminNote: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

reportStatusLogSchema.index({ reportId: 1, createdAt: -1 });

module.exports = mongoose.model('ReportStatusLog', reportStatusLogSchema);
