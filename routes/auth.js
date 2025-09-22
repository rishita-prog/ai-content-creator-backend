const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// In-memory user store (replace with database in production)
const users = new Map();
const apiKeys = new Map();

// Generate API key
function generateApiKey() {
  return 'acc_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Register endpoint
router.post('/register', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('name').isLength({ min: 2, max: 50 }).trim().withMessage('Name must be 2-50 characters')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { email, password, name } = req.body;

  // Check if user already exists
  if (users.has(email)) {
    return res.status(409).json({
      success: false,
      error: 'User already exists'
    });
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);
  
  // Generate API key
  const apiKey = generateApiKey();
  
  // Create user
  const user = {
    id: Date.now().toString(),
    email,
    name,
    password: hashedPassword,
    apiKey,
    createdAt: new Date().toISOString(),
    plan: 'free',
    usage: {
      requests: 0,
      limit: 100 // Free tier limit
    }
  };

  users.set(email, user);
  apiKeys.set(apiKey, user);

  // Generate JWT
  const token = jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '7d' }
  );

  res.status(201).json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        apiKey: user.apiKey
      },
      token
    }
  });
}));

// Login endpoint
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { email, password } = req.body;

  // Find user
  const user = users.get(email);
  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials'
    });
  }

  // Check password
  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials'
    });
  }

  // Generate JWT
  const token = jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '7d' }
  );

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        apiKey: user.apiKey,
        usage: user.usage
      },
      token
    }
  });
}));

// Get user profile
router.get('/profile', asyncHandler(async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'No token provided'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = Array.from(users.values()).find(u => u.id === decoded.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          plan: user.plan,
          apiKey: user.apiKey,
          usage: user.usage,
          createdAt: user.createdAt
        }
      }
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
}));

// Generate new API key
router.post('/regenerate-key', asyncHandler(async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'No token provided'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = Array.from(users.values()).find(u => u.id === decoded.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Remove old API key
    apiKeys.delete(user.apiKey);
    
    // Generate new API key
    const newApiKey = generateApiKey();
    user.apiKey = newApiKey;
    
    // Update maps
    users.set(user.email, user);
    apiKeys.set(newApiKey, user);

    res.json({
      success: true,
      data: {
        apiKey: newApiKey
      }
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
}));

// Validate API key endpoint
router.post('/validate-key', [
  body('apiKey').notEmpty().withMessage('API key required')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { apiKey } = req.body;
  const user = apiKeys.get(apiKey);

  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Invalid API key'
    });
  }

  res.json({
    success: true,
    data: {
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        usage: user.usage
      }
    }
  });
}));

// Usage stats endpoint
router.get('/usage', asyncHandler(async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required'
    });
  }

  const user = apiKeys.get(apiKey);
  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Invalid API key'
    });
  }

  res.json({
    success: true,
    data: {
      usage: user.usage,
      plan: user.plan,
      resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
    }
  });
}));

// Demo/guest access endpoint
router.post('/guest', asyncHandler(async (req, res) => {
  const guestApiKey = 'guest_' + Date.now();
  const guestUser = {
    id: 'guest_' + Date.now(),
    email: 'guest@demo.com',
    name: 'Guest User',
    apiKey: guestApiKey,
    plan: 'demo',
    usage: {
      requests: 0,
      limit: 10 // Demo limit
    },
    createdAt: new Date().toISOString()
  };

  apiKeys.set(guestApiKey, guestUser);

  res.json({
    success: true,
    data: {
      user: {
        id: guestUser.id,
        name: guestUser.name,
        plan: guestUser.plan,
        apiKey: guestUser.apiKey,
        usage: guestUser.usage
      },
      message: 'Guest access granted. Limited to 10 requests.'
    }
  });
}));

module.exports = router;