import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import passport from './config/passport';
import authRoutes from './routes/auth';
import chatRoutes from './routes/chat';
import uploadRoutes from './routes/upload';
import documentRoutes from './routes/documents';
import healthRoutes from './routes/health';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

// Flexible CORS: allow local dev and production domains
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'https://ai-doc-summer.vercel.app'
].filter(Boolean) as string[];

app.use(cors({ 
  origin: (origin, callback) => {
    // Allow same-origin (no origin) or allowed origins or any vercel.app subdomain
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// Request logger for production debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});
app.use(express.json());
app.use(cookieParser());

app.use(
  session({
    secret: process.env.JWT_SECRET || 'supersecretkey',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production', sameSite: 'lax' }
  })
);
app.use(passport.initialize());
app.use(passport.session());

// Standard routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/health', healthRoutes);

// Fallback: If Vercel strips /api, handle direct routes
app.use('/auth', authRoutes);
app.use('/chat', chatRoutes);
app.use('/upload', uploadRoutes);
app.use('/documents', documentRoutes);
app.use('/health', healthRoutes);

if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

export default app;
