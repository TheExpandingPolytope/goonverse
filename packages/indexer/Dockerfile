FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY . .

# Needed for contract address resolution by chain id in Railway subdir builds.
COPY contract ./contract

ENV NODE_ENV=production
ENV PORT=42069
ENV DATABASE_SCHEMA=ponder
EXPOSE 42069

# Bind to Railway's assigned $PORT.
CMD ["sh", "-c", "npm run start -- --hostname 0.0.0.0 --port ${PORT:-42069} --schema ${DATABASE_SCHEMA:-ponder}"]


