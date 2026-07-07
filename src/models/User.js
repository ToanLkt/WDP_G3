const mongoose = require('mongoose');
const { roles } = require('../utils/constants');

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
    },
    avatarUrl: {
      type: String,
      default: '',
      trim: true,
    },
    avatar: {
      type: String,
      default: '',
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required() {
        return this.provider === 'local';
      },
      select: false,
    },
    provider: {
      type: String,
      enum: ['local', 'google', 'github'],
      default: 'local',
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    githubId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    githubUsername: {
      type: String,
      trim: true,
    },
    role: {
      type: String,
      enum: roles,
      default: 'student',
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'banned'],
      default: 'active',
    },
    settings: {
      language: {
        type: String,
        enum: ['en', 'vi'],
        default: 'vi',
      },
      theme: {
        type: String,
        enum: ['light', 'dark', 'system'],
        default: 'system',
      },
      emailNotifications: {
        type: Boolean,
        default: true,
      },
      aiFeedbackNotifications: {
        type: Boolean,
        default: true,
      },
      profileVisibility: {
        type: String,
        enum: ['private', 'public'],
        default: 'private',
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('User', userSchema);
