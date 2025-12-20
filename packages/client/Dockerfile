FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Needed so Vite can bundle contract addresses by chain id at build time.
COPY contract ./contract

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runner

# The official nginx image will envsubst templates in /etc/nginx/templates at startup.
ENV PORT=3000
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]


