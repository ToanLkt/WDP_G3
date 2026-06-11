const authService = require('../services/auth.service');
const { getFrontendRedirectUrl } = require('../config/frontend');
const { successResponse } = require('../utils/response');

const register = async (req, res, next) => {
  try {
    const result = await authService.registerUser(req.body);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const result = await authService.loginUser(req.body);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const loginWithGoogle = async (req, res, next) => {
  try {
    const result = await authService.loginWithGoogle(req.body);
    return res.status(result.statusCode).json({
      success: true,
      message: result.message,
      data: {
        ...result.data,
        redirectUrl: getFrontendRedirectUrl(req.body && req.body.redirectUrl, req.get('origin')),
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        data: null,
      });
    }

    return next(error);
  }
};

const loginWithGithub = async (req, res, next) => {
  try {
    const result = await authService.loginWithGithub(req.body);
    return res.status(result.statusCode).json({
      success: true,
      message: result.message,
      data: {
        ...result.data,
        redirectUrl: getFrontendRedirectUrl(req.body && req.body.redirectUrl, req.get('origin')),
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        data: null,
      });
    }

    return next(error);
  }
};

const getMe = async (req, res, next) => {
  try {
    const result = await authService.getCurrentUser(req.user);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const result = await authService.logoutUser({ authUser: req.user, token: req.token });
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const result = await authService.changePassword({ authUser: req.user, body: req.body });
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  changePassword,
  register,
  login,
  loginWithGoogle,
  loginWithGithub,
  getMe,
  logout,
};
