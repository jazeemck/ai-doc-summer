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

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors({ 
  origin: process.env.CLIENT_URL || '*', 
  credentials: true 
}));
app.use(express.json());
app.use(cookieParser());

app.use(
  session({
    secret: process.env.JWT_SECRET || 'supersecretkey',
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/documents', documentRoutes);

if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

export default app;
