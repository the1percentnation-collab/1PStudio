"""MinIO/S3 helpers. Keys are 'bucket/path' strings platform-wide."""
import boto3

from .config import settings

_s3 = None


def s3():
    global _s3
    if _s3 is None:
        _s3 = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
        )
    return _s3


def split_key(full_key: str) -> tuple[str, str]:
    bucket, _, key = full_key.partition("/")
    return bucket, key


def download(full_key: str, dest_path: str) -> None:
    bucket, key = split_key(full_key)
    s3().download_file(bucket, key, dest_path)
