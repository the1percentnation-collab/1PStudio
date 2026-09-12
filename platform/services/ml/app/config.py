import os


class Settings:
    asr_backend: str = os.environ.get("ASR_BACKEND", "auto")  # auto | whisper | mock
    anthropic_api_key: str = os.environ.get("ANTHROPIC_API_KEY", "")
    # Haiku is ~3x cheaper than the Sonnet tier and handles structured clip
    # selection fine; override via ANTHROPIC_MODEL for a quality bump.
    anthropic_model: str = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5")
    redis_url: str = os.environ.get("REDIS_URL", "redis://localhost:6379")
    s3_endpoint: str = os.environ.get("S3_ENDPOINT", "http://localhost:9000")
    s3_access_key: str = os.environ.get("S3_ACCESS_KEY", "onepct")
    s3_secret_key: str = os.environ.get("S3_SECRET_KEY", "onepct-secret")


settings = Settings()
