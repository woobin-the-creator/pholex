ARG DOCKER_REGISTRY=""
FROM ${DOCKER_REGISTRY}node:20-alpine

ARG NPM_REGISTRY_URL=""

WORKDIR /app

# Optional npm mirror (no-op when NPM_REGISTRY_URL is empty)
RUN if [ -n "$NPM_REGISTRY_URL" ]; then npm config set registry "$NPM_REGISTRY_URL"; fi

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
