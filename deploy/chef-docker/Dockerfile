# syntax=docker/dockerfile:1
# Same pinned base as the inspected Zeer deployment reference. Verify platform support on the VPS.
FROM node:24.14.0-trixie-slim@sha256:8c8f12cedb96c3b59642cf30d713943c2b223990c9919b96a141681f62e6e292
WORKDIR /app
ENV NODE_ENV=production
COPY project/package.json project/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY project/chef.config.ts project/chef.generated.ts project/projection.ts project/schema.graphql project/bounded-prep-client.mjs ./
COPY runtime.mjs stage-context.mjs ./
USER 986:978
EXPOSE 39375
ENTRYPOINT ["node", "runtime.mjs"]
CMD ["api"]
