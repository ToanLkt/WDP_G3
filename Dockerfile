FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PATH="/opt/venv/bin:$PATH"
ENV DEV2VEC_ENABLED="true"
ENV DEV2VEC_PYTHON_BIN="/opt/venv/bin/python"
ENV DEV2VEC_INFER_PATH="ml_service/infer.py"
ENV DEV2VEC_ARTIFACTS_DIR="ml_service/artifacts"
ENV DEV2VEC_TIMEOUT_MS="30000"
ENV DEV2VEC_MAX_BUFFER_BYTES="10485760"

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    python3-venv \
    python3-pip \
    build-essential \
  && python3 -m venv /opt/venv \
  && rm -rf /var/lib/apt/lists/*

COPY ml_service/requirements.txt ml_service/requirements.txt
RUN pip install --upgrade pip setuptools wheel \
  && pip install --no-cache-dir -r ml_service/requirements.txt

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 5000

CMD ["npm", "start"]
