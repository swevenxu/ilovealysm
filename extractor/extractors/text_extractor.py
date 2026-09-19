"""Text/Markdown extractor — handles TXT and MD files with encoding detection."""

from __future__ import annotations

from pathlib import Path

import chardet

from ..models import (
    ExtractionMethod,
    ExtractedPage,
    ExtractionResult,
    FileType,
    PageReport,
    VerificationReport,
    VerificationStatus,
)

# Approximate characters per "page" for text files
CHARS_PER_PAGE = 3000


def _detect_encoding(file_path: str | Path) -> str | None:
    """Detect file encoding using chardet."""
    with open(file_path, "rb") as f:
        raw = f.read()
    result = chardet.detect(raw)
    return result.get("encoding")


class TextExtractor:
    """Extract and verify TXT/Markdown files."""

    @staticmethod
    def verify(file_path: str | Path) -> VerificationReport:
        """Run verification checks on a TXT/Markdown file.

        Checks:
        1. File opens and decodes as valid text.
        2. Encoding is recognized.
        """
        filename = Path(file_path).name
        suffix = Path(file_path).suffix.lower().lstrip(".")
        file_type = FileType.MD if suffix == "md" else FileType.TXT

        try:
            encoding = _detect_encoding(file_path)

            if not encoding:
                return VerificationReport(
                    filename=filename,
                    file_type=file_type,
                    status=VerificationStatus.CORRUPTED,
                    message="Unable to detect file encoding.",
                )

            with open(file_path, "r", encoding=encoding) as f:
                content = f.read()

            if not content.strip():
                return VerificationReport(
                    filename=filename,
                    file_type=file_type,
                    status=VerificationStatus.CORRUPTED,
                    message="File is empty or contains only whitespace.",
                )

            char_count = len(content)
            estimated_pages = max(1, char_count // CHARS_PER_PAGE)

            page_reports = [
                PageReport(
                    page_number=i + 1,
                    has_text_layer=True,
                    text_length=min(CHARS_PER_PAGE, char_count - i * CHARS_PER_PAGE),
                )
                for i in range(estimated_pages)
            ]

            return VerificationReport(
                filename=filename,
                file_type=file_type,
                status=VerificationStatus.READABLE,
                page_count=estimated_pages,
                pages=page_reports,
                message=(
                    f"Text file readable. Encoding: {encoding}. "
                    f"{char_count} characters, ~{estimated_pages} estimated pages."
                ),
            )

        except UnicodeDecodeError as e:
            return VerificationReport(
                filename=filename,
                file_type=file_type,
                status=VerificationStatus.CORRUPTED,
                message=f"Encoding error: {e}",
                error=str(e),
            )
        except Exception as e:
            return VerificationReport(
                filename=filename,
                file_type=file_type,
                status=VerificationStatus.CORRUPTED,
                message=f"Cannot read file: {e}",
                error=str(e),
            )

    @staticmethod
    def extract(file_path: str | Path) -> ExtractionResult:
        """Extract text from a TXT/Markdown file, chunked into page-sized segments."""
        filename = Path(file_path).name
        suffix = Path(file_path).suffix.lower().lstrip(".")
        file_type = FileType.MD if suffix == "md" else FileType.TXT

        try:
            encoding = _detect_encoding(file_path) or "utf-8"

            with open(file_path, "r", encoding=encoding) as f:
                content = f.read()
        except Exception as e:
            return ExtractionResult(
                filename=filename,
                file_type=file_type,
                error=f"Cannot read file: {e}",
            )

        # Chunk by lines, respecting page size limit
        lines = content.split("\n")
        pages: list[ExtractedPage] = []
        current_chunk: list[str] = []
        current_chars = 0
        page_num = 1

        for line in lines:
            current_chunk.append(line)
            current_chars += len(line) + 1

            if current_chars >= CHARS_PER_PAGE:
                page_text = "\n".join(current_chunk)
                pages.append(
                    ExtractedPage(
                        page_number=page_num,
                        text=page_text,
                        extraction_method=ExtractionMethod.DIRECT,
                        char_count=len(page_text),
                    )
                )
                page_num += 1
                current_chunk = []
                current_chars = 0

        if current_chunk:
            page_text = "\n".join(current_chunk)
            pages.append(
                ExtractedPage(
                    page_number=page_num,
                    text=page_text,
                    extraction_method=ExtractionMethod.DIRECT,
                    char_count=len(page_text),
                )
            )

        total_chars = sum(p.char_count for p in pages)

        return ExtractionResult(
            filename=filename,
            file_type=file_type,
            page_count=len(pages),
            pages=pages,
            total_chars=total_chars,
        )
