# 08. Open Questions

1. Production hosting on Render is not proven by repo files. Add Render dashboard/export or `render.yaml` if the report must state Render as CONFIRMED.
2. MongoDB Atlas is not proven by code. The backend accepts any MongoDB URI; Atlas requires deployment/env evidence outside this repo.
3. Exact production API URL is not present as committed config. `.env` is not included in documentation to avoid secrets.
4. Web/mobile production clients are inferred from CORS/redirect config, but client repositories were not inspected in this backend-only task.
5. No runtime rate limiting was found. If an API gateway or Render layer applies it, that is outside source evidence.
6. No external email, push notification, cloud storage, webhook, cache provider, vector database, or third-party auth beyond Google/GitHub was confirmed.
7. Swagger schema/response fidelity was not fully validated against every controller response; generated comments may drift from Mongoose models.
8. Dev2Vec implementation uses shipped Python artifacts and backend evidence mapping; exact training provenance and equivalence to original Dev2Vec research require ML audit beyond backend source.
9. Some model field-level constraints need manual line-by-line review if the report requires every scalar field in a spreadsheet-quality data dictionary.
10. Report screenshots were not captured because no local server/browser run was requested in this task output; `/api/swagger` is ready to capture after starting the app with valid env.
