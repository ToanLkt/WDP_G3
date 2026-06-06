const mongoose = require('mongoose');

const userSettingsSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    theme: {
      type: String,
      enum: ['dark', 'light', 'system'],
      default: 'system',
    },
    language: {
      type: String,
      enum: ['vi', 'en'],
      default: 'vi',
    },
    notificationEnabled: {
      type: Boolean,
      default: true,
    },
    reminderEnabled: {
      type: Boolean,
      default: true,
    },
    githubAnalysisReminder: {
      type: Boolean,
      default: true,
    },
    roadmapTaskReminder: {
      type: Boolean,
      default: true,
    },
    repositoryImprovementReminder: {
      type: Boolean,
      default: true,
    },
    reminderTime: {
      type: String,
      default: '20:00',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('UserSettings', userSettingsSchema);
