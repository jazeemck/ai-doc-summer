import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import passport from '../config/passport';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey_change_in_production';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    res.status(400).json({ error: 'Missing required fields: name, email, or password' });
    return;
  }
  if (!emailRegex.test(email)) {
    res.status(400).json({ error: 'Invalid email format' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters long' });
    return;
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.authProvider === 'google') {
         res.status(400).json({ error: 'Email is already registered via Google. Please log in with Google.' });
         return;
      }
      res.status(400).json({ error: 'Email already registered' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        authProvider: 'local',
      },
    });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
    res.status(201).json({ user: { id: user.id, email: user.email, name: user.name, authProvider: user.authProvider }, token });
  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Missing required fields: email or password' });
    return;
  }
  if (!emailRegex.test(email)) {
    res.status(400).json({ error: 'Invalid email format' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: 'User with this email not found' });
      return;
    }
    if (user.authProvider === 'google' || !user.password) {
      res.status(401).json({ error: 'Please log in with Google' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      res.status(401).json({ error: 'Incorrect password' });
      return;
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
    res.status(200).json({ user: { id: user.id, email: user.email, name: user.name, authProvider: user.authProvider }, token });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// Google OAuth Routes
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', passport.authenticate('google', { session: true, failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=google_failed` }), (req, res) => {
  if (!req.user) {
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=google_failed`);
  }

  const { token } = req.user as any; // The token is attached in the passport strategy

  // We set the token cookie here so the React app can pick it up via /auth/me or direct use
  res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
  
  // Successful authentication, redirect to chat.
  res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/chat`);
});

router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, role: true }
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

export default router;
