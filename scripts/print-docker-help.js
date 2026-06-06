console.log(`
==================================================
WDP Career Roadmap API - Docker Guide
==================================================

Docker services are starting/running.

If Docker command fails:
1. Open Docker Desktop
2. Wait until Docker Engine is running
3. Run the command again

Useful commands:
- Start services:
  docker compose up -d

- View logs:
  docker compose logs -f api

- Stop services:
  docker compose down

- Stop and remove database volume:
  docker compose down -v

URLs:
- API Base URL:
  http://localhost:5000

- Swagger UI:
  http://localhost:5000/api/swagger

Test flow:
1. Open Swagger
2. Register or login
3. Copy JWT token
4. Click Authorize
5. Enter: Bearer <JWT_TOKEN>

==================================================
`);
