const express = require('express');
const { body, validationResult } = require('express-validator');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// In-memory content store (replace with database in production)
const contentStore = new Map();

// Save generated content
router.post('/save', [
  body('title').isLength({ min: 1, max: 200 }).trim().withMessage('Title must be 1-200 characters'),
  body('content').isLength({ min: 10 }).withMessage('Content must be at least 10 characters'),
  body('contentType').isIn(['presentation', 'document', 'social', 'blog', 'email']).withMessage('Invalid content type'),
  body('language').optional().isIn(['english', 'spanish', 'french', 'german', 'chinese', 'japanese', 'portuguese']),
  body('tone').optional().isIn(['professional', 'casual', 'creative', 'persuasive', 'informative', 'humorous'])
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { title, content, contentType, language = 'english', tone = 'professional', tags = [] } = req.body;
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required'
    });
  }

  const contentId = Date.now().toString();
  const savedContent = {
    id: contentId,
    title,
    content,
    contentType,
    language,
    tone,
    tags,
    apiKey,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    wordCount: content.split(' ').length,
    characterCount: content.length
  };

  contentStore.set(contentId, savedContent);

  res.status(201).json({
    success: true,
    data: {
      id: contentId,
      title,
      contentType,
      createdAt: savedContent.createdAt,
      wordCount: savedContent.wordCount
    }
  });
}));

// Get user's saved content
router.get('/list', asyncHandler(async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const { contentType, limit = 20, offset = 0 } = req.query;

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required'
    });
  }

  let userContent = Array.from(contentStore.values())
    .filter(content => content.apiKey === apiKey);

  // Filter by content type if specified
  if (contentType && contentType !== 'all') {
    userContent = userContent.filter(content => content.contentType === contentType);
  }

  // Sort by creation date (newest first)
  userContent.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Apply pagination
  const total = userContent.length;
  const paginatedContent = userContent.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

  // Return summary data (not full content)
  const contentSummaries = paginatedContent.map(content => ({
    id: content.id,
    title: content.title,
    contentType: content.contentType,
    language: content.language,
    tone: content.tone,
    tags: content.tags,
    wordCount: content.wordCount,
    characterCount: content.characterCount,
    createdAt: content.createdAt,
    updatedAt: content.updatedAt
  }));

  res.json({
    success: true,
    data: {
      content: contentSummaries,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < total
      }
    }
  });
}));

// Get specific content by ID
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required'
    });
  }

  const content = contentStore.get(id);

  if (!content) {
    return res.status(404).json({
      success: false,
      error: 'Content not found'
    });
  }

  // Check if user owns this content
  if (content.apiKey !== apiKey) {
    return res.status(403).json({
      success: false,
      error: 'Access denied'
    });
  }

  res.json({
    success: true,
    data: content
  });
}));

// Update content
router.put('/:id', [
  body('title').optional().isLength({ min: 1, max: 200 }).trim(),
  body('content').optional().isLength({ min: 10 }),
  body('tags').optional().isArray()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { id } = req.params;
  const apiKey = req.headers['x-api-key'];
  const updates = req.body;

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required'
    });
  }

  const content = contentStore.get(id);

  if (!content) {
    return res.status(404).json({
      success: false,
      error: 'Content not found'
    });
  }

  if (content.apiKey !== apiKey) {
    return res.status(403).json({
      success: false,
      error: 'Access denied'
    });
  }

  // Update content
  const updatedContent = {
    ...content,
    ...updates,
    updatedAt: new Date().toISOString()
  };

  // Recalculate word/character count if content was updated
  if (updates.content) {
    updatedContent.wordCount = updates.content.split(' ').length;
    updatedContent.characterCount = updates.content.length;
  }

  contentStore.set(id, updatedContent);

  res.json({
    success: true,
    data: updatedContent
  });
}));

// Delete content
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required'
    });
  }

  const content = contentStore.get(id);

  if (!content) {
    return res.status(404).json({
      success: false,
      error: 'Content not found'
    });
  }

  if (content.apiKey !== apiKey) {
    return res.status(403).json({
      success: false,
      error: 'Access denied'
    });
  }

  contentStore.delete(id);

  res.json({
    success: true,
    message: 'Content deleted successfully'
  });
}));

// Export content in different formats
router.get('/:id/export', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { format = 'txt' } = req.query;
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required'
    });
  }

  const content = contentStore.get(id);

  if (!content) {
    return res.status(404).json({
      success: false,
      error: 'Content not found'
    });
  }

  if (content.apiKey !== apiKey) {
    return res.status(403).json({
      success: false,
      error: 'Access denied'
    });
  }

  let exportContent;
  let contentType;
  let filename;

  switch (format.toLowerCase()) {
    case 'txt':
      exportContent = content.content;
      contentType = 'text/plain';
      filename = `${content.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
      break;
    
    case 'md':
    case 'markdown':
      exportContent = content.content;
      contentType = 'text/markdown';
      filename = `${content.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
      break;
    
    case 'json':
      exportContent = JSON.stringify(content, null, 2);
      contentType = 'application/json';
      filename = `${content.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
      break;
    
    default:
      return res.status(400).json({
        success: false,
        error: 'Unsupported export format. Supported: txt, md, json'
      });
  }

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(exportContent);
}));

// Get content analytics
router.get('/analytics/summary', asyncHandler(async (req, res) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required'
    });
  }

  const userContent = Array.from(contentStore.values())
    .filter(content => content.apiKey === apiKey);

  const analytics = {
    totalContent: userContent.length,
    totalWords: userContent.reduce((sum, content) => sum + content.wordCount, 0),
    totalCharacters: userContent.reduce((sum, content) => sum + content.characterCount, 0),
    contentByType: {},
    contentByLanguage: {},
    contentByTone: {},
    recentActivity: userContent
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5)
      .map(content => ({
        id: content.id,
        title: content.title,
        contentType: content.contentType,
        createdAt: content.createdAt
      }))
  };

  // Count by type
  userContent.forEach(content => {
    analytics.contentByType[content.contentType] = 
      (analytics.contentByType[content.contentType] || 0) + 1;
  });

  // Count by language
  userContent.forEach(content => {
    analytics.contentByLanguage[content.language] = 
      (analytics.contentByLanguage[content.language] || 0) + 1;
  });

  // Count by tone
  userContent.forEach(content => {
    analytics.contentByTone[content.tone] = 
      (analytics.contentByTone[content.tone] || 0) + 1;
  });

  res.json({
    success: true,
    data: analytics
  });
}));

module.exports = router;