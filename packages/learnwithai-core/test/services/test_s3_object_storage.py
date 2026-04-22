from __future__ import annotations

from unittest.mock import MagicMock

from learnwithai.services.s3_object_storage import NoopObjectStorage, S3ObjectStorage


def test_upload_pdf_calls_put_object_with_secure_defaults() -> None:
    s3_client = MagicMock()
    storage = S3ObjectStorage(
        bucket="bucket-a",
        region="us-east-1",
        key_prefix="exam-files",
        s3_client=s3_client,
    )

    storage.upload_pdf("courses/1/exam-pdfs/123/test.pdf", b"%PDF-1.7")

    s3_client.put_object.assert_called_once_with(
        Bucket="bucket-a",
        Key="exam-files/courses/1/exam-pdfs/123/test.pdf",
        Body=b"%PDF-1.7",
        ContentType="application/pdf",
        ServerSideEncryption="AES256",
    )


def test_upload_pdf_without_prefix_uses_raw_key() -> None:
    s3_client = MagicMock()
    storage = S3ObjectStorage(
        bucket="bucket-a",
        region="us-east-1",
        key_prefix="",
        s3_client=s3_client,
    )

    storage.upload_pdf("courses/2/exam-pdfs/123/test.pdf", b"%PDF")

    assert s3_client.put_object.call_args.kwargs["Key"] == "courses/2/exam-pdfs/123/test.pdf"


def test_noop_object_storage_discards_bytes_gracefully():
    # Arrange
    storage = NoopObjectStorage()
    dummy_key = "exams/test.pdf"
    dummy_bytes = b"%PDF-1.7 dummy content"

    # Act
    result = storage.upload_pdf(dummy_key, dummy_bytes)

    # Assert
    assert result is None
