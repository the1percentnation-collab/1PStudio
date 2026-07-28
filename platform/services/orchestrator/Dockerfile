# Temporal worker: the durable pipeline DAG. Build context is platform/ root.
# openssl-libs stage: node:20-slim ships no libssl, which makes Prisma pick an
# unloadable engine; borrow libssl3/libcrypto3 from the same Debian release
# (pin -bookworm to match node:20-slim's glibc).
FROM python:3.12-slim-bookworm AS openssl-libs

FROM node:20-slim
COPY --from=openssl-libs /usr/lib/x86_64-linux-gnu/libssl.so.3 /usr/lib/x86_64-linux-gnu/libcrypto.so.3 /usr/lib/x86_64-linux-gnu/

# Optional corporate/agent-proxy CAs (directory may be empty — see build-certs/README.md).
COPY build-certs/ /usr/local/share/extra-ca/
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/extra-ca/ca-bundle.crt
RUN if [ -f /usr/local/share/extra-ca/ca-bundle.crt ]; then npm config -g set cafile /usr/local/share/extra-ca/ca-bundle.crt; fi

WORKDIR /app
COPY tsconfig.base.json ./

COPY packages/shared ./packages/shared
RUN cd packages/shared && npm install --no-save typescript @types/node && npx tsc -p tsconfig.json

COPY packages/db ./packages/db
RUN cd packages/db && npm install && npx prisma generate && npx tsc -p tsconfig.json

COPY services/orchestrator/package.json services/orchestrator/tsconfig.json ./services/orchestrator/
RUN cd services/orchestrator \
    && node -e "const p=require('./package.json');p.dependencies['@onepct/shared']='file:../../packages/shared';p.dependencies['@onepct/db']='file:../../packages/db';require('fs').writeFileSync('package.json',JSON.stringify(p,null,2))" \
    && npm install

COPY services/orchestrator/src ./services/orchestrator/src
RUN cd services/orchestrator && npx tsc -p tsconfig.json

WORKDIR /app/services/orchestrator
CMD ["node", "dist/worker.js"]
