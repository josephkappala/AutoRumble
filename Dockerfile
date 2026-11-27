# syntax=docker/dockerfile:1

FROM oven/bun:1-alpine AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --from=builder /app/dist ./dist
COPY server.ts ./server.ts
COPY server ./server
COPY src/types ./src/types

EXPOSE 8080

CMD ["bun", "server.ts"]
