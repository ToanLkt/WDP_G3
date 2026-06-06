const StudentProfile = require('../models/StudentProfile');
const User = require('../models/User');

const ensureAuthUser = (authUser) => {
  if (!authUser || !authUser.userId) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }
};

const sanitizeUser = (user) => {
  if (!user) {
    return null;
  }

  return {
    id: user._id,
    fullName: user.fullName,
    email: user.email,
    avatarUrl: user.avatarUrl || null,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

const sanitizeProfile = (profile) => {
  if (!profile) {
    return null;
  }

  return {
    id: profile._id,
    userId: profile.userId,
    university: profile.university,
    major: profile.major,
    year: profile.year,
    targetCareer: profile.targetCareer,
    currentSkills: profile.currentSkills || [],
    githubUsername: profile.githubUsername,
    githubConnected: Boolean(profile.githubConnected),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
};

const pickProfileUpdate = (body) => {
  const allowed = ['university', 'major', 'year', 'targetCareer', 'currentSkills', 'githubUsername'];
  const updateData = {};

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      updateData[key] = body[key];
    }
  }

  return updateData;
};

const getMyProfile = async (authUser) => {
  ensureAuthUser(authUser);

  const [user, profile] = await Promise.all([
    User.findById(authUser.userId),
    StudentProfile.findOne({ userId: authUser.userId }).lean(),
  ]);

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  return {
    message: 'Profile fetched successfully',
    data: {
      user: sanitizeUser(user),
      profile: sanitizeProfile(profile),
    },
    statusCode: 200,
  };
};

const createMyProfile = async ({ user, body }) => {
  ensureAuthUser(user);

  const existingProfile = await StudentProfile.findOne({ userId: user.userId });
  if (existingProfile) {
    const error = new Error('Profile already exists');
    error.statusCode = 409;
    throw error;
  }

  const userId = user.userId;
  const userUpdate = {};

  if (Object.prototype.hasOwnProperty.call(body, 'fullName')) {
    userUpdate.fullName = String(body.fullName).trim();
  }

  const profileData = pickProfileUpdate(body);
  const updatedUser = Object.keys(userUpdate).length
    ? await User.findByIdAndUpdate(userId, { $set: userUpdate }, { new: true, runValidators: true })
    : await User.findById(userId);

  if (!updatedUser) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const profile = await StudentProfile.create({ userId, ...profileData });
  const plainProfile = typeof profile.toObject === 'function' ? profile.toObject() : profile;

  return {
    message: 'Profile created successfully',
    data: {
      user: sanitizeUser(updatedUser),
      profile: sanitizeProfile(plainProfile),
    },
    statusCode: 201,
  };
};

const updateMyProfile = async ({ user, body }) => {
  ensureAuthUser(user);

  const userId = user.userId;
  const userUpdate = {};

  if (Object.prototype.hasOwnProperty.call(body, 'fullName')) {
    userUpdate.fullName = String(body.fullName).trim();
  }

  const profileUpdate = pickProfileUpdate(body);

  const [updatedUser, profile] = await Promise.all([
    Object.keys(userUpdate).length
      ? User.findByIdAndUpdate(userId, { $set: userUpdate }, { new: true, runValidators: true })
      : User.findById(userId),
    Object.keys(profileUpdate).length
      ? StudentProfile.findOneAndUpdate(
          { userId },
          { $set: profileUpdate },
          { new: true, runValidators: true, upsert: true, setDefaultsOnInsert: true }
        )
      : StudentProfile.findOne({ userId }),
  ]);

  if (!updatedUser) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  return {
    message: 'Profile updated successfully',
    data: {
      user: sanitizeUser(updatedUser),
      profile: sanitizeProfile(profile),
    },
    statusCode: 200,
  };
};

module.exports = {
  createMyProfile,
  getMyProfile,
  updateMyProfile,
};
