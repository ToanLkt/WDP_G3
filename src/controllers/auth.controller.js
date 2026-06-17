const authService = require('../services/auth.service');
const githubService = require('../services/github.service');
const { getGithubAuthRedirectUrl, getGithubConnectUrl } = require('../config/frontend');
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
      data: result.data,
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

const startGithubLogin = async (req, res, next) => {
  try {
    const authorizeUrl = await authService.startGithubOAuthLogin({
      redirectUrl: req.body && (req.body.redirectUrl || req.body.redirectUri),
      origin: req.get('origin'),
    });

    return res.status(200).json({
      success: true,
      authUrl: authorizeUrl,
    });
  } catch (error) {
    return next(error);
  }
};

const handleGithubCallback = async (req, res, next) => {
  try {
    const redirectUrl = await authService.handleGithubOAuthCallback(req.query);
    return res.redirect(302, redirectUrl);
  } catch (authError) {
    try {
      const redirectUrl = await githubService.handleOAuthCallback(req.query);
      return res.redirect(302, redirectUrl);
    } catch (connectError) {
      try {
        const fallbackUrl = new URL(
          getGithubConnectUrl(req.get('origin'), process.env.FRONTEND_URL) ||
          getGithubAuthRedirectUrl(req.get('origin'))
        );
        fallbackUrl.searchParams.set('error', connectError.message || authError.message || 'GitHub OAuth failed');
        return res.redirect(302, fallbackUrl.toString());
      } catch (fallbackError) {
        return next(connectError.statusCode ? connectError : authError);
      }
    }
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
  startGithubLogin,
  handleGithubCallback,
  getMe,
  logout,
};
