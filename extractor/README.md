# Study Hub Extractor Service

Python FastAPI microservice for file verification and text extraction.

## Overview

The extractor service handles:
- **File Verification**: Validates file integrity and detects OCR needs
- **Text Extraction**: Extracts text from PDFs, DOCX, PPTX, and images
- **Format Detection**: Identifies file types and page counts
- **OCR Support**: Processes scanned documents when Tesseract is available

---

## Requirements

### Python Version
- Python **3.10** or later

### Core Dependencies
```bash
fastapi>=0.104.0
uvicorn>=0.24.0
python-multipart>=0.0.6
```

### File Processing
```bash
pypdf>=3.17.0          # PDF extraction
python-docx>=1.1.0     # DOCX extraction
python-pptx>=0.6.23    # PPTX extraction
pillow>=10.1.0         # Image processing
pytesseract>=0.3.10    # OCR (optional)
```

---

## Installation

### 1. Create Virtual Environment (Recommended)

**macOS/Linux:**
```bash
cd extractor
python3 -m venv .venv
source .venv/bin/activate
```

**Windows:**
```bash
cd extractor
python -m venv .venv
.venv\Scripts\activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Install Tesseract (Optional - for OCR)

Tesseract is only needed for processing scanned PDFs and images.

**macOS:**
```bash
brew install tesseract
```

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install tesseract-ocr
```

**Windows:**
1. Download installer from [UB-Mannheim/tesseract](https://github.com/UB-Mannheim/tesseract/wiki)
2. Install to `C:\Program Files\Tesseract-OCR`
3. Add to PATH or set in code:
   ```python
   pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
   ```

**Verify Installation:**
```bash
tesseract --version
```

---

## Running the Service

### Development Mode

```bash
cd extractor
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Options:
- `--reload`: Auto-reload on code changes
- `--host 0.0.0.0`: Accept connections from any IP
- `--port 8000`: Port number (must match `PYTHON_EXTRACTOR_URL` in `.env.local`)

### Production Mode

```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

Options:
- `--workers 4`: Use 4 worker processes (adjust based on CPU cores)
- No `--reload` in production

---

## API Endpoints

### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "tesseract_available": true
}
```

### Verify File
```http
POST /verify
Content-Type: multipart/form-data

file: <binary>
```

**Response:**
```json
{
  "status": "readable" | "needs_ocr" | "corrupted",
  "page_count": 10,
  "file_size_bytes": 1048576,
  "warnings": ["Page 5 has low text density"]
}
```

### Extract Text
```http
POST /extract
Content-Type: multipart/form-data

file: <binary>
use_ocr_fallback: true (optional, default: true)
```

**Response:**
```json
{
  "pages": [
    {
      "page_number": 1,
      "text": "Extracted text content...",
      "extraction_method": "direct" | "ocr"
    }
  ],
  "total_pages": 10,
  "error": null
}
```

### Verify Batch
```http
POST /verify-batch
Content-Type: multipart/form-data

files: <binary[]>
```

**Response:**
```json
{
  "reports": [...],
  "batch_failed": false,
  "total_files": 5,
  "readable": 4,
  "needs_ocr": 1,
  "corrupted": 0
}
```

---

## Supported File Types

| Type | Extensions | Extraction Method |
|------|-----------|------------------|
| PDF | `.pdf` | PyPDF2 + OCR fallback |
| Word | `.docx` | python-docx |
| PowerPoint | `.pptx` | python-pptx |
| Text | `.txt`, `.md` | Direct read |
| Images | `.jpg`, `.jpeg`, `.png` | Tesseract OCR |

---

## File Structure

```
extractor/
├── extractors/              # File type-specific extractors
│   ├── __init__.py
│   ├── pdf_extractor.py    # PDF handling
│   ├── docx_extractor.py   # Word docs
│   ├── pptx_extractor.py   # PowerPoint
│   ├── image_extractor.py  # Images with OCR
│   └── text_extractor.py   # Plain text
├── main.py                  # FastAPI application
├── models.py                # Pydantic data models
├── verifier.py              # Verification logic
├── requirements.txt         # Dependencies
└── README.md               # This file
```

---

## Configuration

### CORS Settings

The service allows CORS from:
- `http://localhost:3000` (Next.js dev)
- `http://127.0.0.1:3000`

To add more origins, edit `main.py`:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://yourdomain.com"  # Add production URL
    ],
    ...
)
```

### File Size Limits

Default: No explicit limit (handled by Next.js at 50MB)

To add a limit in FastAPI:
```python
from fastapi import UploadFile, File

@app.post("/verify")
async def verify_endpoint(file: UploadFile = File(..., max_size=50_000_000)):
    ...
```

---

## Troubleshooting

### 1. Module Not Found Errors

**Problem:**
```
ModuleNotFoundError: No module named 'fastapi'
```

**Solution:**
```bash
# Ensure virtual environment is activated
source .venv/bin/activate  # macOS/Linux
.venv\Scripts\activate     # Windows

# Reinstall dependencies
pip install -r requirements.txt
```

### 2. Tesseract Not Found

**Problem:**
```
TesseractNotFoundError: tesseract is not installed
```

**Solution:**
- Install Tesseract (see Installation section above)
- Verify: `tesseract --version`
- The service will still work without Tesseract, but OCR features will be disabled

### 3. Port Already in Use

**Problem:**
```
ERROR: [Errno 48] Address already in use
```

**Solution:**
```bash
# Find process using port 8000
lsof -ti:8000  # macOS/Linux
netstat -ano | findstr :8000  # Windows

# Kill the process or use a different port
python -m uvicorn main:app --port 8001
```

### 4. CORS Errors in Browser

**Problem:**
```
Access to fetch at 'http://localhost:8000/verify' from origin 'http://localhost:3000' 
has been blocked by CORS policy
```

**Solution:**
- Ensure the extractor service is running
- Check CORS middleware in `main.py` includes your origin
- Restart the service after changing CORS settings

### 5. Large File Processing Timeout

**Problem:**
Files over 10MB time out during processing

**Solution:**
```bash
# Increase timeout
uvicorn main:app --timeout-keep-alive 300
```

Or in code (main.py):
```python
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000,
        timeout_keep_alive=300
    )
```

---

## Development

### Running Tests

```bash
# Install test dependencies
pip install pytest pytest-asyncio httpx

# Run tests
pytest
```

### Code Quality

```bash
# Install linting tools
pip install black flake8 mypy

# Format code
black .

# Lint code
flake8 .

# Type check
mypy .
```

### Adding a New File Type

1. Create extractor in `extractors/`:
```python
# extractors/new_type_extractor.py
def extract_new_type(file_path: Path) -> list[str]:
    """Extract text from new file type"""
    # Your extraction logic
    return ["page 1 text", "page 2 text"]
```

2. Add to `verifier.py`:
```python
from extractors.new_type_extractor import extract_new_type

def extract_file(file_path: Path) -> ExtractionResult:
    if file_type == 'new_ext':
        pages = extract_new_type(file_path)
    ...
```

3. Update supported types in `main.py` docstring

---

## Performance Tips

1. **Use Worker Processes** in production:
   ```bash
   uvicorn main:app --workers 4
   ```

2. **Process Files Asynchronously**:
   - The service supports multiple concurrent requests
   - Configure worker count based on available CPU cores

3. **Monitor Memory Usage**:
   - Large PDFs can use significant memory
   - Consider adding file size limits for very large files

4. **Enable Compression**:
   ```python
   from fastapi.middleware.gzip import GZipMiddleware
   app.add_middleware(GZipMiddleware, minimum_size=1000)
   ```

---

## Security Considerations

1. **Input Validation**:
   - File type validation is done by extension and content
   - Malformed files are caught and return error status

2. **Temporary Files**:
   - All uploaded files are stored in temp directory
   - Files are automatically cleaned up after processing

3. **No Authentication**:
   - This service is designed to run locally
   - Do NOT expose to public internet without adding authentication

4. **File Size Limits**:
   - Implement size limits to prevent resource exhaustion
   - Monitor disk space for temp directory

---

## Production Deployment

### Docker (Recommended)

Create `Dockerfile`:
```dockerfile
FROM python:3.11-slim

# Install Tesseract
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

Build and run:
```bash
docker build -t study-hub-extractor .
docker run -p 8000:8000 study-hub-extractor
```

### Systemd Service (Linux)

Create `/etc/systemd/system/study-hub-extractor.service`:
```ini
[Unit]
Description=Study Hub Extractor Service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/extractor
Environment="PATH=/path/to/.venv/bin"
ExecStart=/path/to/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable study-hub-extractor
sudo systemctl start study-hub-extractor
```

---

## Monitoring

### Health Checks

```bash
# Simple health check
curl http://localhost:8000/health

# With jq for pretty output
curl -s http://localhost:8000/health | jq
```

### Logs

```bash
# Development - logs to stdout
python -m uvicorn main:app --reload

# Production - log to file
uvicorn main:app --log-config logging.ini
```

### Metrics

Add Prometheus metrics:
```bash
pip install prometheus-fastapi-instrumentator
```

```python
from prometheus_fastapi_instrumentator import Instrumentator

Instrumentator().instrument(app).expose(app)
```

---

## License

Part of the Study Hub project. See main LICENSE file.

---

## Support

For issues specific to the extractor service:
1. Check this README for solutions
2. Verify all dependencies are installed
3. Check extractor service logs
4. Open an issue on GitHub with logs and error details
