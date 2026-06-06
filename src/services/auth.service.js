const bcrypt = require('bcryptjs');

const RevokedToken = require('../models/RevokedToken');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');

const sanitizeUser = (userDocument) => ({
  id: userDocument._id,
  fullName: userDocument.fullName,
  email: userDocument.email,
  avatarUrl: userDocument.avatarUrl || null,
  role: userDocument.role,
  settings: userDocument.settings,
  createdAt: userDocument.createdAt,
  updatedAt: userDocument.updatedAt,
});

const buildAuthPayload = (userDocument) => {
  const token = generateToken({
    userId: String(userDocument._id),
    email: userDocument.email,
    role: userDocument.role,
  });

  return {
    user: sanitizeUser(userDocument),
    token,
  };
};

const registerUser = async (payload) => {
  const fullName = String(payload.fullName || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    const error = new Error('Email already exists');
    error.statusCode = 409;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const createdUser = await User.create({
    fullName,
    email,
    password: hashedPassword,
    role: 'student',
  });

  return {
    message: 'Register successful',
    data: buildAuthPayload(createdUser),
    statusCode: 201,
  };
};

const loginUser = async (payload) => {
  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');

  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  const isPasswordMatched = await bcrypt.compare(password, user.password);
  if (!isPasswordMatched) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  return {
    message: 'Login successful',
    data: buildAuthPayload(user),
    statusCode: 200,
  };
};

const getCurrentUser = async (authUser) => {
  if (!authUser || !authUser.userId) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }

  const user = await User.findById(authUser.userId);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  return {
    message: 'Current user retrieved successfully',
    data: sanitizeUser(user),
    statusCode: 200,
  };
};

const logoutUser = async ({ authUser, token }) => {
  if (!authUser || !authUser.userId || !token) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }

  const expiresAt = authUser.exp ? new Date(authUser.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await RevokedToken.updateOne(
    { token },
    {
      $setOnInsert: {
        token,
        userId: authUser.userId,
        expiresAt,
      },
    },
    { upsert: true }
  );

  return {
    message: 'Logout successfully',
    data: null,
    statusCode: 200,
  };
};

const changePassword = async ({ authUser, body }) => {
  if (!authUser || !authUser.userId) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }

  const currentPassword = String(body.currentPassword || '');
  const newPassword = String(body.newPassword || '');
  const user = await User.findById(authUser.userId).select('+password');

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const isPasswordMatched = await bcrypt.compare(currentPassword, user.password);
  if (!isPasswordMatched) {
    const error = new Error('Current password is incorrect');
    error.statusCode = 400;
    throw error;
  }

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  return {
    message: 'Password changed successfully',
    data: null,
    statusCode: 200,
  };
};

module.exports = {
  changePassword,
  registerUser,
  loginUser,
  getCurrentUser,
  logoutUser,
};
