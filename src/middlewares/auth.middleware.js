const jwt = require('jsonwebtoken');

const RevokedToken = require('../models/RevokedToken');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const error = new Error('Authorization token is required');
      error.statusCode = 401;
      throw error;
    }

    if (!process.env.JWT_SECRET) {
      const error = new Error('JWT_SECRET is not configured');
      error.statusCode = 500;
      throw error;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const revokedToken = await RevokedToken.findOne({ token }).lean();

    if (revokedToken) {
      const error = new Error('Token has been logged out');
      error.statusCode = 401;
      throw error;
    }

    req.user = decoded;
    req.token = token;
    return next();
  } catch (error) {
    if (!error.statusCode) {
      error.statusCode = 401;
      error.message = 'Invalid or expired token';
    }

    return next(error);
  }
};

module.exports = authMiddleware;
