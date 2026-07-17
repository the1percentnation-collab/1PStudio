# build-certs

Drop extra CA certificates (`*.crt`) here when building behind a TLS-intercepting
corporate/agent proxy. Dockerfiles copy this directory and export
`NODE_EXTRA_CA_CERTS` / `PIP_CERT` / `SSL_CERT_FILE` so in-build downloads
(Prisma engines, pip wheels) trust the proxy. The directory ships empty;
certificates placed here are gitignored.
