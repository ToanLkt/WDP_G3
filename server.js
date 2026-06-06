const dotenv = require('dotenv');

dotenv.config();

const app = require('./src/app');
const connectDB = require('./src/config/database');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
      console.log(`Swagger UI: http://localhost:${PORT}/api/swagger`);
    });
  } catch (error) {
    console.error('Failed to connect database or start server:', error.message);
    process.exit(1);
  }
};

startServer();
