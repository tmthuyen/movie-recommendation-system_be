# =========================================================
# BASE
# =========================================================
FROM node:22-bookworm-slim AS base

WORKDIR /app

ENV TZ=Asia/Ho_Chi_Minh

# dumb-init giúp Node nhận SIGTERM/SIGINT đúng khi container stop
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       dumb-init \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/*


# =========================================================
# DEPENDENCIES
# Install ALL dependencies
# =========================================================
FROM base AS dependencies

COPY package.json package-lock.json ./

RUN npm ci


# =========================================================
# DEVELOPMENT
# =========================================================
FROM base AS development

ENV NODE_ENV=development

COPY --from=dependencies /app/node_modules ./node_modules

COPY . .

EXPOSE 8081

ENTRYPOINT ["dumb-init", "--"]

CMD ["npm", "run", "dev"]


# =========================================================
# BUILDER
# Compile Typescript -> dist/
# =========================================================
FROM base AS builder

ENV NODE_ENV=development

COPY --from=dependencies /app/node_modules ./node_modules

COPY . .

RUN npm run build


# =========================================================
# PRODUCTION DEPENDENCIES
# =========================================================
FROM base AS production-dependencies

ENV NODE_ENV=production

COPY package.json package-lock.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force


# =========================================================
# PRODUCTION
# =========================================================
FROM base AS production

ENV NODE_ENV=production

COPY --from=production-dependencies /app/node_modules ./node_modules

COPY --from=builder /app/dist ./dist

COPY package.json ./

# Node official image có user "node"
USER node

EXPOSE 8081

ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "dist/main.js"]


FROM node:20-alpine AS builder

WORKDIR /app

# Cài đặt dependencies
COPY package*.json ./
RUN npm install

# Build source code
COPY . .
RUN npm run build

#  production
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.env ./.env

EXPOSE 8081

# Lệnh khởi chạy
CMD ["npm", "run", "start:prod"]
