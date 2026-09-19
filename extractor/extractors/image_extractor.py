"""Image extractor using Tesseract OCR for photographed notes (JPG/PNG)."""

from __future__ import annotations

from pathlib import Path

from ..models import (
    ExtractionMethod,
    ExtractedPage,
    ExtractionResult,
    FileType,
    PageReport,
    VerificationReport,
    VerificationStatus,
)

# Minimum OCR output length to consider the image as text-bearing
MIN_OCR_CHARS = 10


def _get_file_type(file_path: str | Path) -> FileType:
    """Determine FileType from extension."""
    ext = Path(file_path).suffix.lower().lstrip(".")
    if ext == "png":
        return FileType.PNG
    return FileType.JPG  # default for jpg/jpeg


class ImageExtractor:
    """Extract and verify image files (JPG/PNG) via OCR."""

    @staticmethod
    def verify(file_path: str | Path) -> VerificationReport:
        """Run verification checks on an image file.

        Checks:
        1. Is the file a valid, uncorrupted image?
        2. Can OCR extract a minimum amount of text?
        """
        filename = Path(file_path).name
        file_type = _get_file_type(file_path)

        try:
            from PIL import Image

            img = Image.open(str(file_path))
            img.verify()  # Verify it's a valid image
        except Exception as e:
            return VerificationReport(
                filename=filename,
                file_type=file_type,
                status=VerificationStatus.CORRUPTED,
                message=f"Invalid or corrupted image: {e}",
                error=str(e),
            )

        # Re-open (verify() closes the file) and run OCR check
        try:
            from PIL import Image

            img = Image.open(str(file_path))

            try:
                import pytesseract

                ocr_text = pytesseract.image_to_string(img).strip()
            except ImportError:
                return VerificationReport(
                    filename=filename,
                    file_type=file_type,
                    status=VerificationStatus.NEEDS_OCR,
                    page_count=1,
                    pages=[
                        PageReport(
                            page_number=1,
                            has_text_layer=False,
                            text_length=0,
                            needs_ocr=True,
                        )
                    ],
                    message="Tesseract not available. Image needs OCR processing.",
                )

            text_length = len(ocr_text)

            if text_length < MIN_OCR_CHARS:
                return VerificationReport(
                    filename=filename,
                    file_type=file_type,
                    status=VerificationStatus.NEEDS_OCR,
                    page_count=1,
                    pages=[
                        PageReport(
                            page_number=1,
                            has_text_layer=False,
                            text_length=text_length,
                            needs_ocr=True,
                        )
                    ],
                    message=(
                        f"OCR extracted only {text_length} characters. "
                        f"Image may not contain readable text."
                    ),
                )

            return VerificationReport(
                filename=filename,
                file_type=file_type,
                status=VerificationStatus.READABLE,
                page_count=1,
                pages=[
                    PageReport(
                        page_number=1,
                        has_text_layer=True,
                        text_length=text_length,
                    )
                ],
                message=f"OCR extracted {text_length} characters from image.",
            )

        except Exception as e:
            return VerificationReport(
                filename=filename,
                file_type=file_type,
                status=VerificationStatus.CORRUPTED,
                message=f"Error processing image: {e}",
                error=str(e),
            )

    @staticmethod
    def extract(file_path: str | Path) -> ExtractionResult:
        """Extract text from an image via OCR."""
        filename = Path(file_path).name
        file_type = _get_file_type(file_path)

        try:
            from PIL import Image
            import pytesseract

            img = Image.open(str(file_path))
            text = pytesseract.image_to_string(img).strip()

            return ExtractionResult(
                filename=filename,
                file_type=file_type,
                page_count=1,
                pages=[
                    ExtractedPage(
                        page_number=1,
                        text=text,
                        extraction_method=ExtractionMethod.OCR,
                        char_count=len(text),
                    )
                ],
                total_chars=len(text),
            )

        except Exception as e:
            return ExtractionResult(
                filename=filename,
                file_type=file_type,
                error=f"OCR extraction failed: {e}",
            )
