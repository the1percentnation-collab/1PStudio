# Intelligence plane: FastAPI + model seams. Runs fully on CPU with
# deterministic mocks; build with WITH_WHISPER=1 for real ASR.
# apt-free: ffmpeg (used for audio probing) comes from a static-binary stage.
FROM mwader/static-ffmpeg:7.1 AS ffmpeg

FROM python:3.11-slim

COPY --from=ffmpeg /ffmpeg /ffprobe /usr/local/bin/

# Optional corporate/agent-proxy CAs (directory may be empty — see build-certs/README.md).
COPY build-certs/ /usr/local/share/extra-ca/

WORKDIR /srv

ARG WITH_WHISPER=0
COPY services/ml/requirements.txt services/ml/requirements-whisper.txt ./
RUN if [ -f /usr/local/share/extra-ca/ca-bundle.crt ]; then export PIP_CERT=/usr/local/share/extra-ca/ca-bundle.crt REQUESTS_CA_BUNDLE=/usr/local/share/extra-ca/ca-bundle.crt; fi \
    && pip install --no-cache-dir -r requirements.txt \
    && if [ "$WITH_WHISPER" = "1" ]; then pip install --no-cache-dir -r requirements-whisper.txt; fi

COPY services/ml/app ./app

ENV PORT=8000
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
