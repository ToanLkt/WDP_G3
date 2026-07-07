const mongoose = require('mongoose');

const learningResourceSchema = new mongoose.Schema(
  {
    skillName: {
      type: String,
      required: true,
      trim: true,
    },
    canonicalSkillName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    normalizedSkillName: {
      type: String,
      required: true,
      trim: true,
    },
    targetRole: {
      type: String,
      default: 'Software Developer',
      trim: true,
    },
    normalizedTargetRole: {
      type: String,
      trim: true,
    },
    level: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner',
    },
    language: {
      type: String,
      default: 'en',
      trim: true,
    },
    type: {
      type: String,
      enum: ['video', 'article', 'docs'],
      default: 'video',
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    provider: {
      type: String,
      default: 'YouTube',
      trim: true,
    },
    thumbnailUrl: { type: String, default: '' },
    channelTitle: { type: String, default: '' },
    publishedAt: { type: Date },
    tags: { type: [String], default: [] },
    source: {
      type: String,
      enum: ['curated', 'youtube_api', 'manual'],
      default: 'manual',
    },
    score: {
      type: Number,
      default: 0,
    },
    cachedAt: { type: Date },
  },
  { timestamps: true }
);

learningResourceSchema.index({
  normalizedSkillName: 1,
  normalizedTargetRole: 1,
  level: 1,
  language: 1,
  type: 1,
});
learningResourceSchema.index({ url: 1 }, { unique: true });

module.exports = mongoose.model('LearningResource', learningResourceSchema);
