const mongoose = require('mongoose');

const topicMappingSchema = new mongoose.Schema({
  topicId: { type: String, required: true, trim: true },
  roleId: { type: String, required: true, trim: true },
  level: { type: String, enum: ['beginner', 'intermediate', 'advanced'], required: true },
  relevanceScore: { type: Number, min: 0, max: 100, required: true },
}, { _id: false });

const courseraCourseSchema = new mongoose.Schema({
  provider: { type: String, enum: ['coursera'], default: 'coursera', required: true },
  externalId: { type: String, required: true, trim: true },
  canonicalUrl: { type: String, required: true, trim: true, unique: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  contentType: {
    type: String,
    enum: ['course', 'specialization', 'professional_certificate', 'guided_project'],
    required: true,
  },
  partnerName: { type: String, default: '', trim: true },
  level: { type: String, enum: ['beginner', 'intermediate', 'advanced', 'mixed'], default: 'mixed' },
  language: { type: String, default: 'en', trim: true },
  estimatedDuration: { type: String, default: '', trim: true },
  thumbnailUrl: { type: String, default: '', trim: true },
  pricingType: { type: String, enum: ['provider_determined'], default: 'provider_determined' },
  isActive: { type: Boolean, default: true, index: true },
  verifiedAt: { type: Date, required: true },
  roadmapTopicMappings: { type: [topicMappingSchema], default: [] },
}, { timestamps: true });

courseraCourseSchema.index({ 'roadmapTopicMappings.topicId': 1, isActive: 1 });

module.exports = mongoose.model('CourseraCourse', courseraCourseSchema);
