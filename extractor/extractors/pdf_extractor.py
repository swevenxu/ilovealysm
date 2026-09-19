"""PDF extractor using PyMuPDF with Tesseract OCR fallback for scanned pages."""

from __future__ import annotations

import io
from pathlib import Path
from typing import BinaryIO

import fitz  # PyMuPDF

from ..models import (
    ExtractionMethod,
    ExtractedPage,
    ExtractionResult,
    FileType,
    PageReport,
    VerificationReport,
    VerificationStatus,
)

# Minimum characters to consider a page as having readable text
MIN_TEXT_CHARS = 20


def _try_ocr_page(page: fitz.Page) -> str:
    """Attempt OCR on a PDF page by rendering it to an image."""
    try:
        import pytesseract
        from PIL import Image

        # Render page at 300 DPI for good OCR quality
        pix = page.get_pixmap(dpi=300)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        text = pytesseract.image_to_string(img)
        return text.strip()
    except Exception:
        return ""


class PDFExtractor:
    """Extract and verify PDF files."""

    @staticmethod
    def verify(file_path: str | Path) -> VerificationReport:
        """Run verification checks on a PDF file.

        Checks:
        1. Can the file be opened/parsed?
        2. Does the page count match extractable pages?
        3. Per-page: is there a text layer, or is it image-only?
        """
        filename = Path(file_path).name

        try:
            doc = fitz.open(str(file_path))
        except Exception as e:
            return VerificationReport(
                filename=filename,
                file_type=FileType.PDF,
                status=VerificationStatus.CORRUPTED,
                message=f"Cannot open PDF: {e}",
                error=str(e),
            )

        page_reports: list[PageReport] = []
        any_needs_ocr = False
        all_need_ocr = True

        try:
            for i, page in enumerate(doc):
                text = page.get_text("text").strip()
                has_text = len(text) >= MIN_TEXT_CHARS
                needs_ocr = not has_text

                if has_text:
                    all_need_ocr = False
                if needs_ocr:
                    any_needs_ocr = True

                page_reports.append(
                    PageReport(
                        page_number=i + 1,
                        has_text_layer=has_text,
                        text_length=len(text),
                        needs_ocr=needs_ocr,
                    )
                )
        except Exception as e:
            doc.close()
            return VerificationReport(
                filename=filename,
                file_type=FileType.PDF,
                status=VerificationStatus.CORRUPTED,
                message=f"Error reading PDF pages: {e}",
                error=str(e),
            )

        page_count = len(doc)
        doc.close()

        # Determine overall status
        if all_need_ocr and page_count > 0:
            status = VerificationStatus.NEEDS_OCR
            message = f"All {page_count} pages are image-only and require OCR."
        elif any_needs_ocr:
            status = VerificationStatus.NEEDS_OCR
            ocr_pages = [p.page_number for p in page_reports if p.needs_ocr]
            message = (
                f"{page_count} pages found. "
                f"Pages {ocr_pages} are image-only and require OCR."
            )
        else:
            status = VerificationStatus.READABLE
            message = f"{page_count} pages, all with extractable text layers."

        return VerificationReport(
            filename=filename,
            file_type=FileType.PDF,
            status=status,
            page_count=page_count,
            pages=page_reports,
            message=message,
        )

    @staticmethod
    def extract(file_path: str | Path, use_ocr_fallback: bool = True) -> ExtractionResult:
        """Extract text from all pages of a PDF.

        For pages without a text layer, falls back to OCR if enabled.
        """
        filename = Path(file_path).name

        try:
            doc = fitz.open(str(file_path))
        except Exception as e:
            return ExtractionResult(
                filename=filename,
                file_type=FileType.PDF,
                error=f"Cannot open PDF: {e}",
            )

        pages: list[ExtractedPage] = []
        total_chars = 0

        for i, page in enumerate(doc):
            text = page.get_text("text").strip()
            method = ExtractionMethod.DIRECT

            # Fallback to OCR if text layer is insufficient
            if len(text) < MIN_TEXT_CHARS and use_ocr_fallback:
                ocr_text = _try_ocr_page(page)
                if ocr_text:
                    text = ocr_text
                    method = ExtractionMethod.OCR

            char_count = len(text)
            total_chars += char_count

            pages.append(
                ExtractedPage(
                    page_number=i + 1,
                    text=text,
                    extraction_method=method,
                    char_count=char_count,
                )
            )

        page_count = len(doc)
        doc.close()

        return ExtractionResult(
            filename=filename,
            file_type=FileType.PDF,
            page_count=page_count,
            pages=pages,
            total_chars=total_chars,
        )
