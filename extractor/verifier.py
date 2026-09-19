"""Verification pipeline — isolated, reusable module.

This is the strict gatekeeper for the entire processing pipeline.
Every file must pass verification before any sorting, summarization,
or quiz generation happens.
"""

from __future__ import annotations

from pathlib import Path
from typing import BinaryIO

from .models import (
    FileType,
    VerificationReport,
    VerificationStatus,
    ExtractionResult,
)
from .extractors import (
    PDFExtractor,
    DOCXExtractor,
    PPTXExtractor,
    TextExtractor,
    ImageExtractor,
)


# Map file extensions to FileType enum values
EXTENSION_MAP: dict[str, FileType] = {
    ".pdf": FileType.PDF,
    ".docx": FileType.DOCX,
    ".pptx": FileType.PPTX,
    ".txt": FileType.TXT,
    ".md": FileType.MD,
    ".jpg": FileType.JPG,
    ".jpeg": FileType.JPEG,
    ".png": FileType.PNG,
}

# Map FileType to extractor classes
VERIFIERS = {
    FileType.PDF: PDFExtractor,
    FileType.DOCX: DOCXExtractor,
    FileType.PPTX: PPTXExtractor,
    FileType.TXT: TextExtractor,
    FileType.MD: TextExtractor,
    FileType.JPG: ImageExtractor,
    FileType.JPEG: ImageExtractor,
    FileType.PNG: ImageExtractor,
}


def detect_file_type(file_path: str | Path) -> FileType | None:
    """Detect the file type from extension."""
    ext = Path(file_path).suffix.lower()
    return EXTENSION_MAP.get(ext)


def verify_file(file_path: str | Path) -> VerificationReport:
    """Run the full verification pipeline on a single file.

    This is the main entry point for file verification.
    Returns a VerificationReport with one of:
    - readable — content successfully extracted
    - needs_ocr — image-only content that needs OCR
    - corrupted — cannot be opened or parsed
    """
    file_path = Path(file_path)
    filename = file_path.name

    if not file_path.exists():
        return VerificationReport(
            filename=filename,
            file_type=FileType.TXT,  # fallback
            status=VerificationStatus.CORRUPTED,
            message=f"File not found: {file_path}",
            error="File not found",
        )

    file_type = detect_file_type(file_path)

    if file_type is None:
        return VerificationReport(
            filename=filename,
            file_type=FileType.TXT,  # fallback
            status=VerificationStatus.CORRUPTED,
            message=f"Unsupported file format: {file_path.suffix}",
            error="Unsupported format",
        )

    extractor = VERIFIERS.get(file_type)

    if extractor is None:
        return VerificationReport(
            filename=filename,
            file_type=file_type,
            status=VerificationStatus.CORRUPTED,
            message=f"No verifier available for {file_type.value} files.",
            error="No verifier",
        )

    return extractor.verify(str(file_path))


def extract_file(file_path: str | Path, use_ocr_fallback: bool = True) -> ExtractionResult:
    """Extract text from a verified file.

    Only call this AFTER verification has passed (status = readable or needs_ocr).
    """
    file_path = Path(file_path)
    file_type = detect_file_type(file_path)

    if file_type is None:
        return ExtractionResult(
            filename=file_path.name,
            file_type=FileType.TXT,
            error=f"Unsupported file format: {file_path.suffix}",
        )

    extractor = VERIFIERS.get(file_type)

    if extractor is None:
        return ExtractionResult(
            filename=file_path.name,
            file_type=file_type,
            error=f"No extractor available for {file_type.value} files.",
        )

    # PDF extractor accepts use_ocr_fallback parameter
    if file_type == FileType.PDF:
        return extractor.extract(str(file_path), use_ocr_fallback=use_ocr_fallback)

    return extractor.extract(str(file_path))


def verify_batch(file_paths: list[str | Path]) -> list[VerificationReport]:
    """Verify a batch of files.

    Per the specification: if ANY file comes back corrupted,
    the batch should be flagged — callers should halt processing.

    Returns all reports so the caller can decide how to proceed.
    """
    reports = []
    for fp in file_paths:
        report = verify_file(fp)
        reports.append(report)
    return reports


def batch_has_failures(reports: list[VerificationReport]) -> bool:
    """Check if any report in a batch has corrupted status."""
    return any(r.status == VerificationStatus.CORRUPTED for r in reports)


def get_ocr_needed(reports: list[VerificationReport]) -> list[VerificationReport]:
    """Get all reports that need OCR processing."""
    return [r for r in reports if r.status == VerificationStatus.NEEDS_OCR]
