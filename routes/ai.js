const express = require('express');
const { body, validationResult } = require('express-validator');
const aiService = require('../services/aiService');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// Validation middleware
const validateGenerateRequest = [
  body('prompt')
    .isLength({ min: 10, max: 2000 })
    .withMessage('Prompt must be between 10 and 2000 characters')
    .trim()
    .escape(),
  body('contentType')
    .isIn(['presentation', 'document', 'social', 'blog', 'email'])
    .withMessage('Invalid content type'),
  body('language')
    .optional()
    .isIn(['english', 'spanish', 'french', 'german', 'chinese', 'japanese', 'portuguese'])
    .withMessage('Invalid language'),
  body('tone')
    .optional()
    .isIn(['professional', 'casual', 'creative', 'persuasive', 'informative', 'humorous'])
    .withMessage('Invalid tone')
];

// Generate content endpoint
router.post('/generate', validateGenerateRequest, asyncHandler(async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { prompt, contentType, language = 'english', tone = 'professional' } = req.body;

  // Log request for analytics
  console.log(`AI Generation Request: ${contentType} | ${language} | ${tone} | ${prompt.substring(0, 50)}...`);

  const startTime = Date.now();
  
  try {
    const content = await aiService.generateContent({
      prompt,
      contentType,
      language,
      tone
    });

    const generationTime = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        content,
        metadata: {
          contentType,
          language,
          tone,
          wordCount: content.split(' ').length,
          characterCount: content.length,
          generationTime: `${generationTime}ms`,
          timestamp: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    console.error('AI Generation Error:', error);
    res.status(500).json({
      success: false,
      error: 'Content generation failed',
      message: 'Please try again in a moment. Our AI service is temporarily unavailable.',
      retryAfter: 30
    });
  }
}));

// Get available options endpoint
router.get('/options', (req, res) => {
  res.json({
    success: true,
    data: {
      contentTypes: [
        { value: 'presentation', label: '📊 Presentation', description: 'Multi-slide decks with structure' },
        { value: 'document', label: '📄 Document', description: 'Professional reports & documentation' },
        { value: 'social', label: '📱 Social Media', description: 'Viral-ready posts with hashtags' },
        { value: 'blog', label: '📝 Blog Post', description: 'SEO-optimized articles' },
        { value: 'email', label: '📧 Email', description: 'High-converting campaigns' }
      ],
      languages: [
        { value: 'english', label: '🇺🇸 English' },
        { value: 'spanish', label: '🇪🇸 Spanish' },
        { value: 'french', label: '🇫🇷 French' },
        { value: 'german', label: '🇩🇪 German' },
        { value: 'chinese', label: '🇨🇳 Chinese' },
        { value: 'japanese', label: '🇯🇵 Japanese' },
        { value: 'portuguese', label: '🇧🇷 Portuguese' }
      ],
      tones: [
        { value: 'professional', label: '👔 Professional', description: 'Business-appropriate tone' },
        { value: 'casual', label: '😊 Casual', description: 'Friendly and conversational' },
        { value: 'creative', label: '🎨 Creative', description: 'Innovative and inspiring' },
        { value: 'persuasive', label: '💪 Persuasive', description: 'Compelling and action-oriented' },
        { value: 'informative', label: '📚 Informative', description: 'Educational and clear' },
        { value: 'humorous', label: '😄 Humorous', description: 'Light-hearted and entertaining' }
      ]
    }
  });
});

// Get AI service stats (for monitoring)
router.get('/stats', (req, res) => {
  try {
    const stats = aiService.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve stats'
    });
  }
});

// Template suggestions endpoint
router.get('/templates', (req, res) => {
  const templates = [
    {
      id: 1,
      name: 'Startup Pitch Deck',
      category: 'presentation',
      description: 'Professional pitch deck template for startups seeking investment',
      prompt: 'Create a comprehensive startup pitch deck for [COMPANY NAME] that addresses [PROBLEM], presents our [SOLUTION], shows market opportunity, business model, and financial projections',
      tags: ['startup', 'investment', 'business']
    },
    {
      id: 2,
      name: 'Viral Social Media Campaign',
      category: 'social',
      description: 'Engaging social media post templates designed to go viral',
      prompt: 'Create a viral social media campaign about [TOPIC] that includes engaging hooks, valuable content, and trending hashtags',
      tags: ['viral', 'social media', 'engagement']
    },
    {
      id: 3,
      name: 'Technical Documentation',
      category: 'document',
      description: 'Comprehensive technical documentation template',
      prompt: 'Create detailed technical documentation for [PRODUCT/API] including setup, usage examples, and troubleshooting',
      tags: ['technical', 'documentation', 'api']
    },
    {
      id: 4,
      name: 'Product Launch Strategy',
      category: 'presentation',
      description: 'Complete product launch presentation template',
      prompt: 'Create a product launch strategy presentation for [PRODUCT] including features, market strategy, and timeline',
      tags: ['product launch', 'strategy', 'marketing']
    },
    {
      id: 5,
      name: 'Thought Leadership Blog',
      category: 'blog',
      description: 'Authority-building blog post template',
      prompt: 'Write a thought leadership blog post about [INDUSTRY TOPIC] with insights, analysis, and predictions',
      tags: ['thought leadership', 'blog', 'authority']
    },
    {
      id: 6,
      name: 'Sales Email Sequence',
      category: 'email',
      description: 'High-converting email sequence template',
      prompt: 'Create a 5-email sales sequence for [PRODUCT/SERVICE] that nurtures leads and drives conversions',
      tags: ['sales', 'email marketing', 'conversion']
    }
  ];

  const { category } = req.query;
  
  let filteredTemplates = templates;
  if (category && category !== 'all') {
    filteredTemplates = templates.filter(t => t.category === category);
  }

  res.json({
    success: true,
    data: {
      templates: filteredTemplates,
      totalCount: templates.length,
      filteredCount: filteredTemplates.length
    }
  });
});

// Batch generation endpoint (for multiple content pieces)
router.post('/batch', [
  body('requests')
    .isArray({ min: 1, max: 5 })
    .withMessage('Requests must be an array with 1-5 items'),
  body('requests.*.prompt')
    .isLength({ min: 10, max: 2000 })
    .withMessage('Each prompt must be between 10 and 2000 characters'),
  body('requests.*.contentType')
    .isIn(['presentation', 'document', 'social', 'blog', 'email'])
    .withMessage('Invalid content type in request')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { requests } = req.body;
  const results = [];

  for (const request of requests) {
    try {
      const content = await aiService.generateContent(request);
      results.push({
        success: true,
        content,
        request: request
      });
    } catch (error) {
      results.push({
        success: false,
        error: error.message,
        request: request
      });
    }
  }

  res.json({
    success: true,
    data: {
      results,
      totalRequests: requests.length,
      successfulRequests: results.filter(r => r.success).length
    }
  });
}));

module.exports = router;