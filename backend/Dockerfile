FROM node:20-alpine AS builder

WORKDIR /app

# Cài đặt dependencies
COPY package*.json ./
RUN npm install

# Build source code
COPY . .
RUN npm run build

# Chạy app ở production
FROM node:20-alpine

WORKDIR /app

# Copy các thư mục cần thiết từ builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.env ./.env

EXPOSE 8081

# Lệnh khởi chạy
CMD ["npm", "run", "start:prod"]
