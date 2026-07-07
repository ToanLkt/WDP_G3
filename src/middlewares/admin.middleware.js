const User = require('../models/User');

const adminMiddleware = async (req, res, next) => {
  try {
    const userId = req.user && (req.user.userId || req.user.id);

    if (!userId) {
      const error = new Error('Unauthorized');
      error.statusCode = 401;
      throw error;
    }

    const user = await User.findById(userId).select('role status').lean();
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    if (user.status && user.status !== 'active') {
      const error = new Error('Account is not active');
      error.statusCode = 403;
      throw error;
    }

    if (user.role !== 'admin') {
      const error = new Error('Admin permission is required');
      error.statusCode = 403;
      throw error;
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = adminMiddleware;
