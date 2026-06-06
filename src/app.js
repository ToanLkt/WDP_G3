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
const { successResponse, errorResponse } = require("./utils/response");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  return successResponse(res, "Backend is running", {
    service: "career-roadmap-be",
  });
});

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
