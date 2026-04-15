"""Storage interface contracts for persisted documents."""

from typing import Protocol, runtime_checkable


@runtime_checkable
class ObjectStorage(Protocol):
    """Defines the required operations for exam PDF object storage."""

    def upload_pdf(self, key: str, pdf_bytes: bytes) -> None:
        """Stores PDF bytes under a backend-specific object key."""
