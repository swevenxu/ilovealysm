/**
 * Processing queue for batch file operations.
 *
 * Manages the pipeline: verify → extract → generate quizzes
 * with rate limiting and progress tracking.
 * 
 * This queue now actually processes jobs by calling the appropriate API endpoints.
 */

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type JobType = 'verify' | 'extract' | 'generate_quizzes';

export interface QueueJob {
  id: string;
  fileId: string;
  filename: string;
  type: JobType;
  status: JobStatus;
  progress: number; // 0–100
  error?: string;
  startedAt?: number;
  completedAt?: number;
  result?: unknown;
  options?: Record<string, unknown>;
}

export interface QueueState {
  jobs: QueueJob[];
  isProcessing: boolean;
  currentJob: string | null;
}

type QueueListener = (state: QueueState) => void;

/**
 * Job processor that calls the appropriate API endpoint
 */
async function processJob(job: QueueJob): Promise<unknown> {
  const baseDelay = 100; // Small delay between progress updates
  
  switch (job.type) {
    case 'verify': {
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: job.fileId }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Verification failed');
      }
      
      return await response.json();
    }
    
    case 'generate_quizzes': {
      const response = await fetch('/api/generate/quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          fileId: job.fileId,
          ...(job.options || {}),
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Quiz generation failed');
      }
      
      return await response.json();
    }
    
    case 'extract':
      // Extract is typically handled within verify, but can be standalone
      throw new Error('Extract job type not yet implemented as standalone operation');
    
    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

class ProcessingQueue {
  private state: QueueState = {
    jobs: [],
    isProcessing: false,
    currentJob: null,
  };

  private listeners: Set<QueueListener> = new Set();
  private processing = false;

  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    listener(this.state); // Send current state immediately
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l({ ...this.state }));
  }

  addJob(job: Omit<QueueJob, 'status' | 'progress'>): string {
    const newJob: QueueJob = {
      ...job,
      status: 'queued',
      progress: 0,
    };
    this.state.jobs.push(newJob);
    this.notify();
    
    // Start processing if not already running
    if (!this.processing) {
      this.processNext();
    }
    
    return newJob.id;
  }

  private async processNext() {
    if (this.processing) return;

    const nextJob = this.state.jobs.find((j) => j.status === 'queued');
    if (!nextJob) {
      this.state.isProcessing = false;
      this.state.currentJob = null;
      this.notify();
      return;
    }

    this.processing = true;
    this.state.isProcessing = true;
    this.state.currentJob = nextJob.id;
    nextJob.status = 'processing';
    nextJob.startedAt = Date.now();
    this.notify();

    try {
      // Simulate progress for better UX
      this.updateJobProgress(nextJob.id, 10);
      
      // Actually process the job
      const result = await processJob(nextJob);
      
      this.updateJobProgress(nextJob.id, 90);
      
      // Mark as complete
      nextJob.status = 'completed';
      nextJob.progress = 100;
      nextJob.completedAt = Date.now();
      nextJob.result = result;
      this.notify();
    } catch (error) {
      const err = error as Error;
      nextJob.status = 'failed';
      nextJob.error = err.message;
      nextJob.completedAt = Date.now();
      this.notify();
    } finally {
      this.processing = false;
      
      // Process next job in queue after a small delay
      setTimeout(() => this.processNext(), 500);
    }
  }

  updateJobProgress(jobId: string, progress: number) {
    const job = this.state.jobs.find((j) => j.id === jobId);
    if (job) {
      job.progress = Math.min(100, Math.max(0, progress));
      this.notify();
    }
  }

  completeJob(jobId: string, result?: unknown) {
    const job = this.state.jobs.find((j) => j.id === jobId);
    if (job) {
      job.status = 'completed';
      job.progress = 100;
      job.completedAt = Date.now();
      job.result = result;
      this.notify();
      // Process next in queue
      this.processing = false;
      this.processNext();
    }
  }

  failJob(jobId: string, error: string) {
    const job = this.state.jobs.find((j) => j.id === jobId);
    if (job) {
      job.status = 'failed';
      job.error = error;
      job.completedAt = Date.now();
      this.notify();
      this.processing = false;
      this.processNext();
    }
  }

  getJob(jobId: string): QueueJob | undefined {
    return this.state.jobs.find((j) => j.id === jobId);
  }

  getState(): QueueState {
    return { ...this.state };
  }

  clearCompleted() {
    this.state.jobs = this.state.jobs.filter(
      (j) => j.status !== 'completed' && j.status !== 'failed'
    );
    this.notify();
  }

  /**
   * Get all jobs for a specific file
   */
  getFileJobs(fileId: string): QueueJob[] {
    return this.state.jobs.filter((j) => j.fileId === fileId);
  }

  /**
   * Cancel a queued job
   */
  cancelJob(jobId: string): boolean {
    const job = this.state.jobs.find((j) => j.id === jobId);
    if (job && job.status === 'queued') {
      job.status = 'failed';
      job.error = 'Cancelled by user';
      job.completedAt = Date.now();
      this.notify();
      return true;
    }
    return false;
  }
}

// Singleton queue instance
export const processingQueue = new ProcessingQueue();
