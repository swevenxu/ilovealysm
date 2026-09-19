# Study Hub

**Personal Study Material Manager with AI-powered note reformatting and quiz generation.**

Upload study materials (PDFs, DOCX, PPTX, images), verify and extract text, generate clean study notes, create practice quizzes, and track your learning progress across topics.

![Study Hub](https://img.shields.io/badge/Next.js-16.3-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-green?logo=supabase)

---

## Features

- **File Management**: Upload and organize study materials (PDF, DOCX, PPTX, images)
- **Smart Verification**: Automatically verify file readability and detect OCR needs
- **Note Reformatting**: AI-powered reformatting of raw text into clean, structured study notes
- **Quiz Generation**: Create multiple-choice questions and flashcards from your materials
- **Progress Tracking**: Monitor mastery scores and review schedules per topic
- **Full-text Search**: Search across all notes and quizzes
- **Topic Organization**: Organize materials by subject with automatic categorization

---

## Architecture

### Tech Stack

**Frontend**
- Next.js 16.3 (App Router)
- React 19
- TypeScript
- Lucide Icons

**Backend**
- Next.js API Routes
- Supabase (PostgreSQL + Storage)
- Python FastAPI microservice (file extraction)

**AI/LLM**
- Groq (primary - fast inference)
- Google Gemini (fallback)
- Automatic failover and rate limiting

---

## Prerequisites

Before you begin, ensure you have:

- **Node.js** 20.x or later
- **npm** 10.x or later
- **Python** 3.10 or later (for file extraction service)
- **Supabase account** (free tier works)
- **Groq API key** (free tier: 30 req/min)
- **Google Gemini API key** (optional, for fallback)

---

## Quick Start

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd study-hub

# Install Node.js dependencies
npm install

# Install Python dependencies
cd extractor
pip install -r requirements.txt
cd ..
```

### 2. Environment Setup

Create a `.env.local` file in the project root:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# LLM - Groq (primary)
GROQ_API_KEY=gsk_your_groq_api_key_here

# LLM - Google Gemini (fallback)
GEMINI_API_KEY=AIza_your_gemini_api_key_here

# Python Extractor Service
PYTHON_EXTRACTOR_URL=http://localhost:8000
```

#### Getting API Keys

**Supabase:**
1. Go to [supabase.com](https://supabase.com) and create a project
2. Navigate to Settings → API
3. Copy your project URL and keys

**Groq:**
1. Visit [console.groq.com](https://console.groq.com)
2. Sign up for free tier
3. Generate an API key
4. Free tier: 30 requests/min, 6,000 tokens/min

**Google Gemini:**
1. Go to [aistudio.google.com](https://aistudio.google.com/app/apikey)
2. Create an API key
3. This is optional but recommended as fallback

### 3. Database Setup

Run the database schema in your Supabase SQL Editor:

```bash
# Copy schema to clipboard or open in editor
cat supabase-schema.sql
```

Then in Supabase Dashboard:
1. Go to SQL Editor
2. Create a new query
3. Paste the contents of `supabase-schema.sql`
4. Run the query

For an existing Study Hub database, run `supabase-todo-migration.sql` as a separate query to add persistent To Do storage.

### 4. Storage Setup

In Supabase Dashboard:
1. Go to **Storage**
2. Click **Create bucket**
3. Name it `study-files`
4. Set it to **Private**
5. Configure:
   - Max file size: 50MB
   - Allowed MIME types: 
     - `application/pdf`
     - `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
     - `application/vnd.openxmlformats-officedocument.presentationml.presentation`
     - `text/plain`
     - `text/markdown`
     - `image/jpeg`
     - `image/png`

### 5. Seed Topics (Optional)

Run the setup script to populate default topics:

```bash
npm run setup
```

This creates the Pinnacle CPA exam topics (FAR, AFAR, MS, AT, AP, TAX, RFBT).

### 6. Start Development Servers

**Terminal 1 - Next.js**
```bash
npm run dev
```

**Terminal 2 - Python Extractor**
```bash
cd extractor
python -m uvicorn main:app --reload
```

### 7. Open Application

Navigate to [http://localhost:3000](http://localhost:3000)

---

## Project Structure

```
study-hub/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── api/               # API routes
│   │   │   ├── dashboard/     # Dashboard stats
│   │   │   ├── files/         # File management
│   │   │   ├── generate/      # AI generation endpoints
│   │   │   ├── notes/         # Notes CRUD
│   │   │   ├── quizzes/       # Quiz CRUD
│   │   │   ├── upload/        # File upload
│   │   │   └── verify/        # File verification
│   │   ├── files/             # File browser UI
│   │   ├── notes/             # Notes viewer
│   │   ├── quizzes/           # Quiz interface
│   │   ├── progress/          # Progress dashboard
│   │   └── layout.tsx         # Root layout
│   ├── components/            # React components
│   │   ├── ErrorBoundary.tsx  # Error handling
│   │   └── Sidebar.tsx        # Navigation
│   ├── lib/                   # Utilities
│   │   ├── api-utils.ts       # API helpers
│   │   ├── llm.ts             # LLM client
│   │   ├── queue.ts           # Job queue
│   │   ├── supabase.ts        # Database client
│   │   └── validation.ts      # Zod schemas
│   └── types/                 # TypeScript types
├── extractor/                 # Python microservice
│   ├── extractors/            # File type extractors
│   ├── main.py               # FastAPI app
│   ├── models.py             # Pydantic models
│   └── verifier.py           # File verification
├── public/                    # Static assets
├── supabase-schema.sql       # Database schema
├── .env.example              # Environment template
└── package.json              # Dependencies
```

---

## Configuration

### LLM Settings

The application uses a dual-provider setup:

**Groq (Primary)**
- Model: `llama-3.3-70b-versatile`
- Fast inference
- Free tier limits: 30 RPM, 6K TPM, 14.4K RPD
- Automatic rate limiting with sliding window

**Gemini (Fallback)**
- Model: `gemini-1.5-flash`
- Activated automatically when Groq is rate-limited
- More generous rate limits

### Rate Limiting

Built-in intelligent rate limiting:
- Sliding window algorithm (accurate tracking)
- Automatic failover to Gemini on rate limit
- Exponential backoff retry (2 attempts)
- Real-time usage monitoring

### File Processing Pipeline

```
Upload → Verify → Extract → Generate Notes → Generate Quizzes
```

Each step can be triggered independently or chained via the job queue.

---

## Python Extractor Service

### Dependencies

The extractor service requires:

```bash
pip install fastapi uvicorn python-multipart
pip install pypdf python-docx python-pptx pillow pytesseract
```

### OCR Support (Optional)

For OCR capabilities, install Tesseract:

**macOS:**
```bash
brew install tesseract
```

**Ubuntu/Debian:**
```bash
sudo apt-get install tesseract-ocr
```

**Windows:**
Download from [tesseract-ocr](https://github.com/UB-Mannheim/tesseract/wiki)

### Starting the Service

```bash
cd extractor
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Health Check

```bash
curl http://localhost:8000/health
```

---

## Database Schema

### Core Tables

- **files**: Uploaded documents with verification status
- **pages**: Per-page extracted text
- **topics**: Subject categories (FAR, AFAR, etc.)
- **notes**: Reformatted study notes
- **quizzes**: Generated questions (MC + flashcards)
- **quiz_attempts**: User attempt history
- **progress**: Per-topic mastery tracking

### Relationships

```
files 1→N pages
files 1→N notes
files 1→N quizzes
topics 1→N notes
topics 1→N quizzes
quizzes 1→N quiz_attempts
topics 1→1 progress
```

---

## Testing

```bash
# Run linter
npm run lint

# Build production bundle
npm run build

# Start production server
npm run start
```

---

## Common Issues

### 1. Supabase Connection Errors

**Problem**: `Supabase not configured` error

**Solution**:
- Verify `.env.local` has correct Supabase URL and keys
- Ensure environment variables are not wrapped in quotes
- Restart dev server after changing `.env.local`

### 2. Python Extractor Unreachable

**Problem**: `ECONNREFUSED localhost:8000`

**Solution**:
- Start the Python extractor service
- Check it's running: `curl http://localhost:8000/health`
- Verify `PYTHON_EXTRACTOR_URL` in `.env.local`

### 3. LLM Rate Limits

**Problem**: "Both Groq and Gemini failed"

**Solution**:
- Wait for rate limit cooldown (1 minute for Groq)
- Verify API keys are valid
- Check Groq/Gemini dashboard for quota

### 4. File Upload Fails

**Problem**: Storage upload errors

**Solution**:
- Ensure Supabase storage bucket `study-files` exists
- Check bucket is set to Private (not Public)
- Verify file type is supported
- Check file size is under 50MB

### 5. Build Errors

**Problem**: TypeScript or linting errors

**Solution**:
```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Run type check
npm run build
```

---

## API Documentation

### File Operations

**Upload File**
```http
POST /api/upload
Content-Type: multipart/form-data

file: <File>
```

**Verify File**
```http
POST /api/verify
Content-Type: application/json

{
  "fileId": "uuid"
}
```

### Generation

**Generate Notes**
```http
POST /api/generate/notes
Content-Type: application/json

{
  "fileId": "uuid",      // optional
  "topicId": "uuid"      // optional
}
```

**Generate Quizzes**
```http
POST /api/generate/quizzes
Content-Type: application/json

{
  "fileId": "uuid",
  "topicId": "uuid",
  "format": "multiple_choice" | "flashcard" | "both",
  "difficulty": "easy" | "medium" | "hard"
}
```

---

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License.

---

## Acknowledgments

- [Next.js](https://nextjs.org) - React framework
- [Supabase](https://supabase.com) - Backend infrastructure
- [Groq](https://groq.com) - Fast LLM inference
- [Google Gemini](https://ai.google.dev) - AI language model
- [Lucide Icons](https://lucide.dev) - Icon library

---

## Support

For issues and questions:
- Open an issue on GitHub
- Check existing issues for solutions
- Review the troubleshooting section above

---

**Built for effective studying**
