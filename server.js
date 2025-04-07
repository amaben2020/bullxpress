import express from 'express';
import IORedis from 'ioredis';
import { Queue, Worker, QueueEvents } from 'bullmq';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';
import { ExpressAdapter } from '@bull-board/express';

const QUEUE_NAME = 'email-queue';

// Redis connection configuration (using Upstash)
const redisConnection = new IORedis({
  host: 'together-shad-11125.upstash.io',
  port: 6379,
  password: 'ASt1AAIjcDEyNDhjMWNjOGU1YWI0NTEzYWQ5MGM2MjY4MjNjMDQwZnAxMA',
  tls: {}, // Required for Upstash
  maxRetriesPerRequest: null,
});

const serverAdapter = new ExpressAdapter();

serverAdapter.setBasePath('/admin');

// Create email queue. Job Queue: A data structure where jobs (tasks) are enqueued and processed asynchronously.
const emailQueue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
});

const app = express();
const PORT = process.env.PORT ?? 8002;

// Middleware to parse JSON bodies otherwise undefined
app.use(express.json());

// Middleware to parse URL-encoded data (for form submissions)
app.use(express.urlencoded({ extended: true }));

// function that sends data to database
const enrollUserToCourse = async (email) => {
  console.log(`Enrolling user ${email}...`);
};

const sendConfirmationEmail = async () => {
  // Simulate email sending (nodemailer, stripe, cloudinary etc)
  await new Promise((resolve) => setTimeout(resolve, 5000));
  console.log('Email sent successfully');
};

app.get('/health', async (req, res) => {
  try {
    return res.send('Working...');
  } catch (e) {
    console.log(e);
  }
});

//Worker: A process that pulls jobs from the queue and processes them
new Worker(
  QUEUE_NAME,
  async (job) => {
    if (job.name === 'send-mail') {
      console.log('Processing email:', job.data);

      await sendConfirmationEmail(); // 👈 Takes 5+ seconds or could be down
    }
  },
  {
    connection: redisConnection,
    limiter: {
      max: 10, // Max 10 jobs per second
      duration: 1000,
    },
  }
);

app.post('/enroll', async (req, res) => {
  try {
    const { email } = req?.body;

    if (!email) {
      return res.json({ message: 'Invalid request' });
    }

    // 1. Database operation (blocking)
    await enrollUserToCourse(req?.body.email);

    // 2. Then queue the email (non-blocking)
    await emailQueue.add(
      'send-mail',
      {
        from: 'uzochukwubenamara@gmail.com',
        to: 'enrollment@gmail.com',
        subject: 'Course Enrollment Email',
        body: 'You have been enrolled in the course. Congratulations!',
      },
      {
        attempts: 3, // Retry 3 times on failure
        backoff: {
          // Exponential backoff
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
      }
    );

    await sendConfirmationEmail();

    res.status(201).json({ message: 'Success' });
  } catch (error) {
    console.log(error);
  }
});

// Queue event listeners
const queueEvents = new QueueEvents(QUEUE_NAME, {
  connection: redisConnection,
});

queueEvents.on('completed', ({ jobId }) => {
  console.log(`Job ${jobId} completed`);
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`Job ${jobId} failed:`, failedReason);
});

createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter: serverAdapter,
});

app.use('/admin', serverAdapter.getRouter());

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
