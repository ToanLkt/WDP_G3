const dotenv = require('dotenv');

dotenv.config();

const app = require('./src/app');
const connectDB = require('./src/config/database');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Swagger UI: ${process.env.API_BASE_URL || `http://localhost:${PORT}`}/api/swagger`);
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(
          `Port ${PORT} is already in use. Stop the existing server or start this app with a different PORT.`
        );
        console.error(`Example: $env:PORT=5001; npm start`);
        process.exit(1);
      }

      console.error('Failed to start server:', error.message);
      process.exit(1);
    });
  } catch (error) {
    console.error('Failed to connect database or start server:', error.message);
    process.exit(1);
  }
};

startServer();
