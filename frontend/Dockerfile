# syntax=docker/dockerfile:1
# Static SPA build served by nginx, reverse-proxying API calls to the
# backend so the browser and API share one origin in production.

FROM node:22-alpine AS build
WORKDIR /app

# Baked into the build - the SPA is proxied through nginx in production,
# so these are same-origin relative paths, not the backend's own address.
ARG VITE_TRPC_URL=/trpc
ARG VITE_API_URL=/api
ENV VITE_TRPC_URL=${VITE_TRPC_URL}
ENV VITE_API_URL=${VITE_API_URL}

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
