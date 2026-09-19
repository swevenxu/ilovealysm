"""PPTX extractor using python-pptx for PowerPoint slide extraction."""

from __future__ import annotations

from pathlib import Path

from pptx import Presentation

from ..models import (
    ExtractionMethod,
    ExtractedPage,
    ExtractionResult,
    FileType,
    PageReport,
    VerificationReport,
    VerificationStatus,
)


class PPTXExtractor:
    """Extract and verify PPTX (PowerPoint) files."""

    @staticmethod
    def verify(file_path: str | Path) -> VerificationReport:
        """Run verification checks on a PPTX file.

        Checks:
        1. Can the file be opened/parsed?
        2. Can slide text and speaker notes be extracted per slide?
        3. Slide count for consistency reporting.
        """
        filename = Path(file_path).name

        try:
            prs = Presentation(str(file_path))
        except Exception as e:
            return VerificationReport(
                filename=filename,
                file_type=FileType.PPTX,
                status=VerificationStatus.CORRUPTED,
                message=f"Cannot open PPTX: {e}",
                error=str(e),
            )

        try:
            slides = list(prs.slides)
            slide_count = len(slides)

            if slide_count == 0:
                return VerificationReport(
                    filename=filename,
                    file_type=FileType.PPTX,
                    status=VerificationStatus.CORRUPTED,
                    message="PPTX file contains no slides.",
                )

            page_reports: list[PageReport] = []
            slides_with_text = 0

            for i, slide in enumerate(slides):
                slide_text = ""

                # Extract text from all shapes
                for shape in slide.shapes:
                    if shape.has_text_frame:
                        for paragraph in shape.text_frame.paragraphs:
                            text = paragraph.text.strip()
                            if text:
                                slide_text += text + " "

                    # Extract table text
                    if shape.has_table:
                        for row in shape.table.rows:
                            for cell in row.cells:
                                text = cell.text.strip()
                                if text:
                                    slide_text += text + " "

                # Extract speaker notes
                if slide.has_notes_slide and slide.notes_slide.notes_text_frame:
                    notes_text = slide.notes_slide.notes_text_frame.text.strip()
                    if notes_text:
                        slide_text += notes_text

                text_length = len(slide_text.strip())
                has_text = text_length > 0

                if has_text:
                    slides_with_text += 1

                page_reports.append(
                    PageReport(
                        page_number=i + 1,
                        has_text_layer=has_text,
                        text_length=text_length,
                        needs_ocr=False,  # PPTX shapes are always text-based
                    )
                )

            message = (
                f"{slide_count} slides found. "
                f"{slides_with_text}/{slide_count} contain extractable text."
            )

            return VerificationReport(
                filename=filename,
                file_type=FileType.PPTX,
                status=VerificationStatus.READABLE,
                page_count=slide_count,
                pages=page_reports,
                message=message,
            )

        except Exception as e:
            return VerificationReport(
                filename=filename,
                file_type=FileType.PPTX,
                status=VerificationStatus.CORRUPTED,
                message=f"Error reading PPTX structure: {e}",
                error=str(e),
            )

    @staticmethod
    def extract(file_path: str | Path) -> ExtractionResult:
        """Extract text from all slides of a PPTX file.

        Extracts shape text, table text, and speaker notes per slide.
        """
        filename = Path(file_path).name

        try:
            prs = Presentation(str(file_path))
        except Exception as e:
            return ExtractionResult(
                filename=filename,
                file_type=FileType.PPTX,
                error=f"Cannot open PPTX: {e}",
            )

        pages: list[ExtractedPage] = []
        total_chars = 0

        for i, slide in enumerate(prs.slides):
            parts: list[str] = []

            # Extract title if present
            if slide.shapes.title and slide.shapes.title.text.strip():
                parts.append(f"## {slide.shapes.title.text.strip()}")
                parts.append("")

            # Extract body text from all shapes (skip title to avoid duplication)
            for shape in slide.shapes:
                if shape == slide.shapes.title:
                    continue

                if shape.has_text_frame:
                    for paragraph in shape.text_frame.paragraphs:
                        text = paragraph.text.strip()
                        if text:
                            # Detect bullet-like formatting
                            if paragraph.level and paragraph.level > 0:
                                indent = "  " * paragraph.level
                                parts.append(f"{indent}- {text}")
                            else:
                                parts.append(text)

                # Extract tables
                if shape.has_table:
                    parts.append("")
                    table = shape.table
                    for row_idx, row in enumerate(table.rows):
                        cells = [cell.text.strip() for cell in row.cells]
                        parts.append("| " + " | ".join(cells) + " |")
                        if row_idx == 0:
                            parts.append("| " + " | ".join(["---"] * len(cells)) + " |")
                    parts.append("")

            # Extract speaker notes
            if slide.has_notes_slide and slide.notes_slide.notes_text_frame:
                notes = slide.notes_slide.notes_text_frame.text.strip()
                if notes:
                    parts.append("")
                    parts.append("**Speaker Notes:**")
                    parts.append(notes)

            slide_text = "\n".join(parts)
            char_count = len(slide_text)
            total_chars += char_count

            pages.append(
                ExtractedPage(
                    page_number=i + 1,
                    text=slide_text,
                    extraction_method=ExtractionMethod.DIRECT,
                    char_count=char_count,
                )
            )

        return ExtractionResult(
            filename=filename,
            file_type=FileType.PPTX,
            page_count=len(pages),
            pages=pages,
            total_chars=total_chars,
        )
