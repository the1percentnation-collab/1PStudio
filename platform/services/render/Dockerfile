# Render engine: Node + static FFmpeg/FFprobe + yt-dlp + vendored fonts for
# ASS caption burn. apt-free by design: ffmpeg comes from a static-binary
# stage, yt-dlp from a python-slim stage — deterministic and proxy-friendly.
# Build context is the platform/ root so @onepct/shared can be vendored in.
FROM mwader/static-ffmpeg:7.1 AS ffmpeg

# Pin -bookworm to match node:20-slim's glibc (the runtime that hosts this python).
FROM python:3.12-slim-bookworm AS ytdlp
# Optional corporate/agent-proxy CAs (directory may be empty — see build-certs/README.md).
COPY build-certs/ /usr/local/share/extra-ca/
RUN if [ -f /usr/local/share/extra-ca/ca-bundle.crt ]; then export PIP_CERT=/usr/local/share/extra-ca/ca-bundle.crt; fi \
    && pip install --no-cache-dir yt-dlp

FROM node:20-slim

COPY --from=ffmpeg /ffmpeg /ffprobe /usr/local/bin/
# Relocated CPython runtime just for yt-dlp (invoked as `python3 -m yt_dlp`),
# plus the openssl libs it links against (node:20-slim ships none).
COPY --from=ytdlp /usr/local /opt/python
COPY --from=ytdlp /usr/lib/x86_64-linux-gnu/libssl.so.3 /usr/lib/x86_64-linux-gnu/libcrypto.so.3 /usr/lib/x86_64-linux-gnu/
ENV PATH="/opt/python/bin:${PATH}" LD_LIBRARY_PATH=/opt/python/lib

# Optional corporate/agent-proxy CAs (directory may be empty).
COPY build-certs/ /usr/local/share/extra-ca/
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/extra-ca/ca-bundle.crt
RUN if [ -f /usr/local/share/extra-ca/ca-bundle.crt ]; then npm config -g set cafile /usr/local/share/extra-ca/ca-bundle.crt; fi

WORKDIR /app

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
RUN cd packages/shared && npm install --no-save typescript @types/node && npx tsc -p tsconfig.json

COPY services/render/package.json services/render/tsconfig.json ./services/render/
RUN cd services/render \
    && node -e "const p=require('./package.json');p.dependencies['@onepct/shared']='file:../../packages/shared';require('fs').writeFileSync('package.json',JSON.stringify(p,null,2))" \
    && npm install --ignore-scripts

COPY services/render/fonts ./services/render/fonts
COPY services/render/src ./services/render/src
RUN cd services/render && npx tsc -p tsconfig.json

ENV PORT=8080 FONTS_DIR=/app/services/render/fonts YTDLP_CMD="python3 -m yt_dlp"
EXPOSE 8080
CMD ["node", "services/render/dist/server.js"]
