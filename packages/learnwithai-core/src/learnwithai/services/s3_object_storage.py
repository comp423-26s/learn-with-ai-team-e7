"""S3-backed object storage adapter for exam PDFs."""

from __future__ import annotations

from typing import Any

import boto3


class S3ObjectStorage:
    """Stores exam PDFs in Amazon S3 or S3-compatible object storage."""

    def __init__(
        self,
        bucket: str,
        region: str,
        endpoint_url: str | None = None,
        key_prefix: str = "",
        server_side_encryption: str = "AES256",
        s3_client: Any | None = None,
    ) -> None:
        """Initializes the S3 object storage adapter.

        Args:
            bucket: S3 bucket for storing PDFs.
            region: AWS region for the bucket.
            endpoint_url: Optional custom endpoint for S3-compatible backends.
            key_prefix: Optional key prefix prepended to every stored key.
            server_side_encryption: S3 server-side encryption mode.
            s3_client: Optional injected S3 client for testing.
        """
        self._bucket = bucket
        self._key_prefix = key_prefix.strip("/")
        self._server_side_encryption = server_side_encryption
        self._client = s3_client or boto3.client("s3", region_name=region, endpoint_url=endpoint_url)

    def upload_pdf(self, key: str, pdf_bytes: bytes) -> None:
        """Uploads a PDF to S3 using secure defaults."""
        self._client.put_object(
            Bucket=self._bucket,
            Key=self._full_key(key),
            Body=pdf_bytes,
            ContentType="application/pdf",
            ServerSideEncryption=self._server_side_encryption,
        )

    def _full_key(self, key: str) -> str:
        """Builds the final object key including any configured prefix."""
        clean_key = key.lstrip("/")
        if not self._key_prefix:
            return clean_key
        return f"{self._key_prefix}/{clean_key}"


class NoopObjectStorage:
    """Development fallback that accepts uploads without persisting them externally."""

    def upload_pdf(self, key: str, pdf_bytes: bytes) -> None:
        """Accepts the upload and intentionally discards the bytes."""
        return None
