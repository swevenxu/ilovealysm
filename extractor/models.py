"""Pydantic models for the extractor service request/response schemas."""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class FileType(str, Enum):
    PDF = "pdf"
    DOCX = "docx"
    PPTX = "pptx"
    TXT = "txt"
    MD = "md"
    JPG = "jpg"
    JPEG = "jpeg"
    PNG = "png"


class VerificationStatus(str, Enum):
    READABLE = "readable"
    NEEDS_OCR = "needs_ocr"
    CORRUPTED = "corrupted"


class ExtractionMethod(str, Enum):
    DIRECT = "direct"
    OCR = "ocr"


# ---------------------------------------------------------------------------
# Page / Slide models
# ---------------------------------------------------------------------------

class PageReport(BaseModel):
    """Per-page verification result."""
    page_number: int
    has_text_layer: bool = True
    text_length: int = 0
    needs_ocr: bool = False
    error: Optional[str] = None


class ExtractedPage(BaseModel):
    """Per-page extracted content."""
    page_number: int
    text: str
    extraction_method: ExtractionMethod = ExtractionMethod.DIRECT
    char_count: int = 0


# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------

class VerificationReport(BaseModel):
    """Full verification report for a single file."""
    filename: str
    file_type: FileType
    status: VerificationStatus
    page_count: int = 0
    pages: list[PageReport] = Field(default_factory=list)
    message: str = ""
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------

class ExtractionResult(BaseModel):
    """Full extraction result for a single file."""
    filename: str
    file_type: FileType
    page_count: int = 0
    pages: list[ExtractedPage] = Field(default_factory=list)
    total_chars: int = 0
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status: str = "ok"
    tesseract_available: bool = False
