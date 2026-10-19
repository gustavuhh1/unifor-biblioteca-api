# syntax=docker/dockerfile:1

# Stage 1: compile TypeScript (needs the dev dependencies)
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Stage 2: final image with only dist/ and the production dependencies
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# The "node" user comes with the base image; never run as root.
USER node
# Cloud Run sends requests to $PORT (8080 by default).
EXPOSE 8080
CMD ["node", "dist/server.js"]
