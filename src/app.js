const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");

const swaggerSpec = require("./config/swagger");
const authRoutes = require("./routes/auth.routes");
const profileRoutes = require("./routes/profile.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const notificationRoutes = require("./routes/notification.routes");
const githubRoutes = require("./routes/github.routes");
const repositoryRoutes = require("./routes/repository.routes");
const analysisRoutes = require("./routes/analysis.routes");
const aiFeedbackRoutes = require("./routes/aiFeedback.routes");
const aiRoutes = require("./routes/ai.routes");
const chatRoutes = require("./routes/chat.routes");
const roadmapRoutes = require("./routes/roadmap.routes");
const progressRoutes = require("./routes/progress.routes");

const errorMiddleware = require("./middlewares/error.middleware");
const { errorResponse } = require("./utils/response");

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.CLIENT_URL,
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8081",
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Career Roadmap API is running",
    data: {
      swagger: "/api/swagger",
      health: "/health",
    },
  });
});

const healthHandler = (req, res) =>
  res.json({
    success: true,
    message: "Server is running",
    data: {
      status: "ok",
      environment: process.env.NODE_ENV || "development",
    },
  });

app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

app.use("/api/auth", authRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/github", githubRoutes);
app.use("/api/repositories", repositoryRoutes);
app.use("/api/analysis", analysisRoutes);
app.use("/api/ai-feedback", aiFeedbackRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/roadmaps", roadmapRoutes);
app.use("/api/progress", progressRoutes);
app.use(
  "/api/swagger",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    swaggerOptions: {
      operationsSorter: "alpha",
      tagsSorter: "alpha",
    },
  })
);

app.use((req, res) => {
  return errorResponse(res, "Route not found", 404, []);
});

app.use(errorMiddleware);

module.exports = app;
