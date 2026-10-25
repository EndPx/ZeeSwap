# syntax=docker/dockerfile:1
ARG NODE_IMAGE
FROM ${NODE_IMAGE}
# Root qualifies this pinned base against the existing mounted VPS Node/native runtime.
WORKDIR /container
COPY runtime.mjs config.mjs healthcheck.mjs probe.mjs ./
USER 986:978
ENTRYPOINT ["/usr/bin/node", "/container/runtime.mjs"]
