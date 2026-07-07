const mongoose = require('mongoose');

const chatSettingSchema = new mongoose.Schema(
  {
    mode: {
      type: String,
      enum: ['AI_AUTO', 'MANUAL'],
      default: 'AI_AUTO',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('ChatSetting', chatSettingSchema);
