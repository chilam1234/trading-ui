# Build static assets, then serve with nginx (includes /binance-api proxy for exchangeInfo)
FROM oven/bun:1-alpine AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

ARG VITE_MARKET_SOURCE=direct-binance
ARG VITE_FANOUT_WS_URL=
ARG VITE_EXCHANGE_PROXY=1

ENV VITE_MARKET_SOURCE=$VITE_MARKET_SOURCE
ENV VITE_FANOUT_WS_URL=$VITE_FANOUT_WS_URL
ENV VITE_EXCHANGE_PROXY=$VITE_EXCHANGE_PROXY

RUN bun run build

FROM nginx:alpine AS runner
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
