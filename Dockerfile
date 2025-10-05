# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder

ENV NODE_ENV=production
ENV NODE_TLS_REJECT_UNAUTHORIZED=0

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
ENV NODE_ENV=production
ENV NODE_TLS_REJECT_UNAUTHORIZED=0

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

RUN mkdir -p /app/storage
VOLUME ["/app/storage"]

EXPOSE 3000

CMD ["npm", "run", "start"]
