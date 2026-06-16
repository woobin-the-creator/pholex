# 멀티스테이지: deps(설치) → dev(vite HMR) / build(정적 빌드) → prod-dist(dist만)
#   dev  컨테이너: vite dev 서버 (docker-compose.dev.yml, target: dev)
#   prod 컨테이너: 빌드된 dist 를 공유 볼륨에 복사만 하고 종료 (docker-compose.prod.yml, target: prod-dist)
# 설치/빌드가 전부 이 Dockerfile 안에서 일어나므로 호스트 node/npm/lock 의존이 없다.

ARG DOCKER_REGISTRY=""

# ── deps: 의존성 설치 (dev/build 공통 베이스) ───────────────────────────────
FROM ${DOCKER_REGISTRY}node:20-alpine AS deps
ARG NPM_REGISTRY_URL=""
WORKDIR /app
# Optional npm mirror (no-op when NPM_REGISTRY_URL is empty)
RUN if [ -n "$NPM_REGISTRY_URL" ]; then npm config set registry "$NPM_REGISTRY_URL"; fi
COPY package.json package-lock.json* ./
# 락이 동기화돼 있으면 npm ci(재현가능), 없거나(미커밋 관례) 어긋나면 npm install 로 폴백.
RUN npm ci || npm install

# ── dev: vite dev 서버 (소스는 런타임에 bind-mount 로 덮임) ──────────────────
FROM deps AS dev
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

# ── build: 정적 빌드 산출물(dist) 생성 ──────────────────────────────────────
FROM deps AS build
COPY . .
RUN npm run build

# ── prod-dist: dist 만 담은 경량 이미지. 공유 볼륨에 복사하고 종료 ───────────
FROM ${DOCKER_REGISTRY}alpine:3.20 AS prod-dist
COPY --from=build /app/dist /built-dist
CMD ["sh", "-c", "cp -R /built-dist/. /frontend_dist/"]
