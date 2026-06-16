ARG DOCKER_REGISTRY=""
FROM ${DOCKER_REGISTRY}node:20-alpine

ARG NPM_REGISTRY_URL=""

WORKDIR /app

# Optional npm mirror (no-op when NPM_REGISTRY_URL is empty)
RUN if [ -n "$NPM_REGISTRY_URL" ]; then npm config set registry "$NPM_REGISTRY_URL"; fi

COPY package.json package-lock.json* ./
# 락이 동기화돼 있으면 npm ci(재현가능), 없거나(미커밋 관례) 어긋나면 npm install 로 폴백.
RUN npm ci || npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
