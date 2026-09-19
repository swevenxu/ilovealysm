"""FastAPI application for the file extraction microservice.

Endpoints:
- POST /verify       — Verify an uploaded file, returns verification report
- POST /extract      — Extract text from a verified file
- POST /verify-batch — Verify multiple files at once
- GET  /health       — Health check (includes Tesseract availability)
"""

from __future__ import annotations

import os
import tempfile
import shutil
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    VerificationReport,
    VerificationStatus,
    ExtractionResult,
    HealthResponse,
)
from .verifier import verify_file, extract_file, verify_batch, batch_has_failures

app = FastAPI(
    title="Study Hub Extractor",
    description="File extraction and verification microservice for Study Hub",
    version="1.0.0",
)

# Allow CORS from Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _save_temp_file(upload_file: UploadFile) -> Path:
    """Save an uploaded file to a temporary location."""
    suffix = Path(upload_file.filename or "file").suffix
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        shutil.copyfileobj(upload_file.file, tmp)
    finally:
        tmp.close()
    return Path(tmp.name)


@app.post("/verify", response_model=VerificationReport)
async def verify_endpoint(file: UploadFile = File(...)):
    """Verify an uploaded file.

    Runs format-specific verification checks and returns a report
    with status: readable, needs_ocr, or corrupted.
    """
    tmp_path = _save_temp_file(file)
    try:
        # Rename to preserve original extension for type detection
        original_name = file.filename or "unknown"
        renamed_path = tmp_path.parent / original_name
        tmp_path.rename(renamed_path)
        tmp_path = renamed_path

        report = verify_file(tmp_path)
        return report
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


@app.post("/extract", response_model=ExtractionResult)
async def extract_endpoint(
    file: UploadFile = File(...),
    use_ocr_fallback: bool = True,
):
    """Extract text from a file.

    Should only be called after verification has passed.
    Returns per-page extracted text.
    """
    tmp_path = _save_temp_file(file)
    try:
        original_name = file.filename or "unknown"
        renamed_path = tmp_path.parent / original_name
        tmp_path.rename(renamed_path)
        tmp_path = renamed_path

        result = extract_file(tmp_path, use_ocr_fallback=use_ocr_fallback)

        if result.error:
            raise HTTPException(status_code=422, detail=result.error)

        return result
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


@app.post("/verify-batch")
async def verify_batch_endpoint(files: list[UploadFile] = File(...)):
    """Verify a batch of files.

    Returns all verification reports. If any file is corrupted,
    includes a batch_failed flag and identifies which files failed.
    """
    tmp_paths: list[Path] = []
    try:
        for upload_file in files:
            tmp_path = _save_temp_file(upload_file)
            original_name = upload_file.filename or "unknown"
            renamed_path = tmp_path.parent / original_name
            tmp_path.rename(renamed_path)
            tmp_paths.append(renamed_path)

        reports = verify_batch(tmp_paths)
        has_failures = batch_has_failures(reports)

        return {
            "reports": [r.model_dump() for r in reports],
            "batch_failed": has_failures,
            "total_files": len(files),
            "readable": sum(1 for r in reports if r.status == VerificationStatus.READABLE),
            "needs_ocr": sum(1 for r in reports if r.status == VerificationStatus.NEEDS_OCR),
            "corrupted": sum(1 for r in reports if r.status == VerificationStatus.CORRUPTED),
        }
    finally:
        for p in tmp_paths:
            if p.exists():
                p.unlink()


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint. Reports Tesseract availability."""
    tesseract_available = False
    try:
        import pytesseract

        pytesseract.get_tesseract_version()
        tesseract_available = True
    except Exception:
        pass

    return HealthResponse(
        status="ok",
        tesseract_available=tesseract_available,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
