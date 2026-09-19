"""File extractors package — format-specific extractors routed by file type."""

from .pdf_extractor import PDFExtractor
from .docx_extractor import DOCXExtractor
from .pptx_extractor import PPTXExtractor
from .text_extractor import TextExtractor
from .image_extractor import ImageExtractor

__all__ = [
    "PDFExtractor",
    "DOCXExtractor",
    "PPTXExtractor",
    "TextExtractor",
    "ImageExtractor",
]
