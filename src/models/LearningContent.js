const mongoose = require('mongoose');

const learningExampleSchema = new mongoose.Schema(
  {
    title: { type: String, default: '' },
    code: { type: String, default: '' },
    explanation: { type: String, default: '' },
  },
  { _id: false }
);

const learningExerciseSchema = new mongoose.Schema(
  {
    title: { type: String, default: '' },
    description: { type: String, default: '' },
  },
  { _id: false }
);

const learningContentSchema = new mongoose.Schema(
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
      default: 'vi',
      trim: true,
      lowercase: true,
    },
    title: { type: String, default: '' },
    overview: { type: String, default: '' },
    whyLearn: { type: String, default: '' },
    useCases: { type: [String], default: [] },
    howToApply: { type: String, default: '' },
    examples: { type: [learningExampleSchema], default: [] },
    checklist: { type: [String], default: [] },
    exercises: { type: [learningExerciseSchema], default: [] },
    commonMistakes: { type: [String], default: [] },
    nextSkills: { type: [String], default: [] },
    generatedBy: {
      type: String,
      enum: ['ai', 'manual'],
      default: 'ai',
    },
  },
  { timestamps: true }
);

// Unique key: skillName + targetRole + level + language.
// If MongoDB already has the old unique index without language, run scripts/fixLearningContentIndexes.js once.
learningContentSchema.index(
  { normalizedSkillName: 1, normalizedTargetRole: 1, level: 1, language: 1 },
  { unique: true }
);

module.exports = mongoose.model('LearningContent', learningContentSchema);
