const express = require("express");

const authController = require("../controllers/auth.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const {
  validateChangePasswordBody,
  validateRegisterBody,
  validateLoginBody,
} = require("../validators/auth.validator");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Authentication APIs
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user account
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *               - email
 *               - password
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: Nguyen Van A
 *               email:
 *                 type: string
 *                 example: student@example.com
 *               password:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       201:
 *         description: Register successful
 *       400:
 *         description: Invalid request body
 *       409:
 *         description: Email already exists
 */
router.post(
  "/register",
  validate(validateRegisterBody),
  authController.register,
);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login and receive JWT token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: student@example.com
 *               password:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       200:
 *         description: Login successful
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Invalid email or password
 */
router.post("/login", validate(validateLoginBody), authController.login);

/**
 * @swagger
 * /api/auth/google:
 *   post:
 *     tags: [Auth]
 *     summary: Login with Google ID token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - idToken
 *             properties:
 *               idToken:
 *                 type: string
 *                 example: google_id_token
 *     responses:
 *       200:
 *         description: Login with Google successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Login with Google successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                     user:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         email:
 *                           type: string
 *                         avatar:
 *                           type: string
 *                         provider:
 *                           type: string
 *                           example: google
 *       400:
 *         description: idToken is required
 *       401:
 *         description: Invalid Google token
 */
router.post("/google", authController.loginWithGoogle);

/**
 * @swagger
 * /api/auth/github:
 *   post:
 *     tags: [Auth]
 *     summary: Start GitHub OAuth2 login
 *     description: Generates a GitHub OAuth authorization URL. Frontend should open authUrl in the browser. No Passport.js is used.
 *     security: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               redirectUrl:
 *                 type: string
 *                 example: http://localhost:5173/auth/github/callback
 *                 description: Optional allowlisted callback URL. Web can use http://localhost:5173/auth/github/callback; mobile can use the exact MOBILE_AUTH_REDIRECT_URL such as gitanalyzer://auth/github/callback. Defaults to GITHUB_AUTH_REDIRECT_URL or FRONTEND_URL /auth/github/callback.
 *     responses:
 *       200:
 *         description: GitHub OAuth authorization URL generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 authUrl:
 *                   type: string
 *                   example: https://github.com/login/oauth/authorize?client_id=xxx&redirect_uri=http%3A%2F%2Flocalhost%3A5000%2Fapi%2Fauth%2Fgithub%2Fcallback&scope=read%3Auser+user%3Aemail&state=abc
 *       500:
 *         description: "GitHub OAuth environment is not configured. Required env: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_CALLBACK_URL, JWT_SECRET, MONGO_URI."
 */
router.post("/github", authController.startGithubLogin);

/**
 * @swagger
 * /api/auth/github/callback:
 *   get:
 *     tags: [Auth]
 *     summary: Handle GitHub OAuth2 callback
 *     description: Exchanges GitHub authorization code for an access token, creates or finds the user, creates a JWT, then redirects to the frontend callback URL.
 *     security: []
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Authorization code returned by GitHub
 *       - in: query
 *         name: state
 *         required: true
 *         schema:
 *           type: string
 *         description: CSRF protection state generated by the backend
 *     responses:
 *       302:
 *         description: Redirect to frontend with accessToken in URL fragment, or error in query string
 *       400:
 *         description: Missing or invalid code/state
 *       500:
 *         description: GitHub OAuth environment or server dependencies are not configured
 */
router.get("/github/callback", authController.handleGithubCallback);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout current authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *       401:
 *         description: Unauthorized
 */
router.post("/logout", authMiddleware, authController.logout);

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Change current authenticated user's password
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *               - confirmPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 example: 123456
 *               newPassword:
 *                 type: string
 *                 example: 1234567
 *               confirmPassword:
 *                 type: string
 *                 example: 1234567
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Invalid request body or current password is incorrect
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.post(
  "/change-password",
  authMiddleware,
  validate(validateChangePasswordBody),
  authController.changePassword,
);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.get("/me", authMiddleware, authController.getMe);

module.exports = router;
