const axios = require('axios');
const NodeCache = require('node-cache');

// Cache for 1 hour to reduce API calls
const cache = new NodeCache({ stdTTL: 3600 });

class AIService {
  constructor() {
    // Free AI APIs - no API keys required for these endpoints
    this.providers = [
      {
        name: 'huggingface',
        url: 'https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium',
        headers: {},
        enabled: true
      },
      {
        name: 'ollama-proxy',
        url: 'https://ollama-proxy.vercel.app/api/generate',
        headers: { 'Content-Type': 'application/json' },
        enabled: true
      },
      {
        name: 'local-llm',
        url: 'http://localhost:11434/api/generate',
        headers: { 'Content-Type': 'application/json' },
        enabled: false // Enable if running local Ollama
      }
    ];

    this.contentTemplates = {
      presentation: {
        systemPrompt: `You are an expert presentation creator. Create a comprehensive slide deck with clear structure, engaging content, and professional formatting. Include slide titles, bullet points, and speaker notes. Format as markdown with clear slide separations.`,
        structure: ['Introduction', 'Problem/Opportunity', 'Solution', 'Benefits', 'Implementation', 'Conclusion']
      },
      document: {
        systemPrompt: `You are a professional document writer. Create well-structured, informative documents with proper headings, sections, and detailed content. Use professional language and clear formatting.`,
        structure: ['Executive Summary', 'Introduction', 'Main Content', 'Analysis', 'Recommendations', 'Conclusion']
      },
      social: {
        systemPrompt: `You are a social media expert. Create engaging, viral-worthy posts with hooks, value, and appropriate hashtags. Keep it concise but impactful.`,
        structure: ['Hook', 'Value Proposition', 'Call to Action', 'Hashtags']
      },
      blog: {
        systemPrompt: `You are a content marketing expert. Write compelling blog posts with SEO optimization, engaging headlines, and valuable insights. Include introduction, main points, and conclusion.`,
        structure: ['Headline', 'Introduction', 'Main Points', 'Examples', 'Conclusion', 'Call to Action']
      },
      email: {
        systemPrompt: `You are an email marketing specialist. Create persuasive, well-structured emails that drive engagement and conversions. Include subject line and clear call to action.`,
        structure: ['Subject Line', 'Opening', 'Value Proposition', 'Benefits', 'Call to Action', 'Closing']
      }
    };

    this.toneModifiers = {
      professional: 'Use a professional, business-appropriate tone with formal language.',
      casual: 'Use a casual, friendly, and conversational tone that feels approachable.',
      creative: 'Use a creative, innovative, and inspiring tone that sparks imagination.',
      persuasive: 'Use a persuasive, compelling, and action-oriented tone that motivates.',
      informative: 'Use an informative, educational, and clear tone that teaches.',
      humorous: 'Use a humorous, light-hearted, and entertaining tone that engages.'
    };

    this.languageInstructions = {
      english: '',
      spanish: 'Write the entire content in Spanish (Español).',
      french: 'Write the entire content in French (Français).',
      german: 'Write the entire content in German (Deutsch).',
      chinese: 'Write the entire content in Chinese (中文).',
      japanese: 'Write the entire content in Japanese (日本語).',
      portuguese: 'Write the entire content in Portuguese (Português).'
    };
  }

  async generateContent({ prompt, contentType, language = 'english', tone = 'professional' }) {
    const cacheKey = `${contentType}-${language}-${tone}-${this.hashString(prompt)}`;
    
    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const template = this.contentTemplates[contentType] || this.contentTemplates.document;
    const fullPrompt = this.buildPrompt(prompt, template, language, tone);

    // Try multiple providers for redundancy
    for (const provider of this.providers.filter(p => p.enabled)) {
      try {
        const result = await this.callProvider(provider, fullPrompt);
        if (result) {
          // Cache successful result
          cache.set(cacheKey, result);
          return result;
        }
      } catch (error) {
        console.warn(`Provider ${provider.name} failed:`, error.message);
        continue;
      }
    }

    // Fallback to template-based generation
    const fallbackResult = this.generateFallbackContent(prompt, contentType, language, tone);
    cache.set(cacheKey, fallbackResult);
    return fallbackResult;
  }

  buildPrompt(userPrompt, template, language, tone) {
    const languageInstruction = this.languageInstructions[language] || '';
    const toneInstruction = this.toneModifiers[tone] || '';
    
    return `${template.systemPrompt}

${languageInstruction}
${toneInstruction}

Topic: ${userPrompt}

Please create high-quality content following this structure: ${template.structure.join(' → ')}

Make it comprehensive, engaging, and actionable.`;
  }

  async callProvider(provider, prompt) {
    const timeout = 30000; // 30 seconds timeout
    
    try {
      let requestData;
      
      switch (provider.name) {
        case 'huggingface':
          requestData = {
            inputs: prompt,
            parameters: {
              max_length: 2000,
              temperature: 0.7,
              do_sample: true
            }
          };
          break;
          
        case 'ollama-proxy':
          requestData = {
            model: 'llama2',
            prompt: prompt,
            stream: false
          };
          break;
          
        case 'local-llm':
          requestData = {
            model: 'llama2',
            prompt: prompt,
            stream: false
          };
          break;
          
        default:
          throw new Error(`Unknown provider: ${provider.name}`);
      }

      const response = await axios.post(provider.url, requestData, {
        headers: provider.headers,
        timeout: timeout
      });

      return this.parseResponse(response.data, provider.name);
    } catch (error) {
      throw new Error(`${provider.name} API call failed: ${error.message}`);
    }
  }

  parseResponse(data, providerName) {
    try {
      switch (providerName) {
        case 'huggingface':
          return Array.isArray(data) ? data[0]?.generated_text : data.generated_text;
          
        case 'ollama-proxy':
        case 'local-llm':
          return data.response || data.text;
          
        default:
          return data.content || data.text || JSON.stringify(data);
      }
    } catch (error) {
      throw new Error(`Failed to parse response from ${providerName}`);
    }
  }

  generateFallbackContent(prompt, contentType, language, tone) {
    const templates = {
      presentation: this.generatePresentationTemplate(prompt, language, tone),
      document: this.generateDocumentTemplate(prompt, language, tone),
      social: this.generateSocialTemplate(prompt, language, tone),
      blog: this.generateBlogTemplate(prompt, language, tone),
      email: this.generateEmailTemplate(prompt, language, tone)
    };

    return templates[contentType] || templates.document;
  }

  generatePresentationTemplate(prompt, language, tone) {
    const prefix = language !== 'english' ? `[Content in ${language}]\n\n` : '';
    const toneNote = tone !== 'professional' ? `[${tone} tone]\n\n` : '';
    
    return `${prefix}${toneNote}# ${prompt}

## 🎯 Slide 1: Introduction
• Welcome to ${prompt}
• Key objectives and goals
• Agenda overview

## 📊 Slide 2: Current Situation
• Market analysis and trends
• Challenges and opportunities
• Key statistics and insights

## 💡 Slide 3: Our Approach
• Innovative solution
• Unique value proposition
• Competitive advantages

## 🚀 Slide 4: Implementation
• Step-by-step roadmap
• Timeline and milestones
• Resource requirements

## 📈 Slide 5: Expected Results
• Projected outcomes
• Success metrics
• ROI analysis

## 🎯 Slide 6: Next Steps
• Immediate actions
• Long-term strategy
• Call to action

---
*Generated by AI Content Creator Pro*`;
  }

  generateDocumentTemplate(prompt, language, tone) {
    const prefix = language !== 'english' ? `[Content in ${language}]\n\n` : '';
    const toneNote = tone !== 'professional' ? `[${tone} tone]\n\n` : '';
    
    return `${prefix}${toneNote}# ${prompt}

## Executive Summary
This comprehensive document explores ${prompt}, providing detailed analysis, insights, and actionable recommendations for stakeholders.

## 1. Introduction
In today's rapidly evolving landscape, ${prompt} has become increasingly critical for organizations seeking competitive advantage and sustainable growth.

## 2. Background Analysis
### Current Market Conditions
• Industry trends and developments
• Competitive landscape overview
• Regulatory environment

### Key Challenges
• Primary obstacles and barriers
• Resource constraints
• Technical limitations

## 3. Strategic Approach
### Methodology
Our approach to ${prompt} incorporates best practices, innovative solutions, and proven frameworks.

### Implementation Framework
• Phase 1: Assessment and planning
• Phase 2: Development and testing
• Phase 3: Deployment and optimization

## 4. Recommendations
### Immediate Actions
1. Conduct comprehensive assessment
2. Develop detailed implementation plan
3. Secure necessary resources

### Long-term Strategy
• Continuous improvement processes
• Performance monitoring systems
• Scalability considerations

## 5. Conclusion
Successful implementation of ${prompt} requires strategic planning, dedicated resources, and ongoing commitment to excellence.

---
*Generated by AI Content Creator Pro*`;
  }

  generateSocialTemplate(prompt, language, tone) {
    const prefix = language !== 'english' ? `[Content in ${language}]\n\n` : '';
    const toneNote = tone !== 'professional' ? `[${tone} tone]\n\n` : '';
    
    return `${prefix}${toneNote}🚀 Ready to transform your approach to ${prompt}? Here's what you need to know! 👇

✨ The game is changing, and those who adapt will thrive. ${prompt} isn't just a trend—it's the future.

🔥 Key insights:
• Innovation drives success
• Early adopters win big
• Action beats perfection

💡 Pro tip: Start small, think big, move fast!

👉 What's your experience with ${prompt}? Share in the comments!

#Innovation #${prompt.replace(/\s+/g, '')} #Success #Growth #Future #Trending #GameChanger #Leadership

---
*Created with AI Content Creator Pro*`;
  }

  generateBlogTemplate(prompt, language, tone) {
    const prefix = language !== 'english' ? `[Content in ${language}]\n\n` : '';
    const toneNote = tone !== 'professional' ? `[${tone} tone]\n\n` : '';
    
    return `${prefix}${toneNote}# The Ultimate Guide to ${prompt}: Everything You Need to Know

## Introduction
In today's fast-paced world, understanding ${prompt} has become essential for anyone looking to stay ahead of the curve. This comprehensive guide will walk you through everything you need to know.

## Why ${prompt} Matters Now More Than Ever
The landscape is shifting rapidly, and ${prompt} is at the center of this transformation. Here's why it should be on your radar:

• **Market Demand**: Growing interest and adoption
• **Competitive Advantage**: Early movers gain significant benefits
• **Future-Proofing**: Essential for long-term success

## Getting Started with ${prompt}
### Step 1: Understanding the Basics
Before diving deep, it's crucial to grasp the fundamental concepts and principles.

### Step 2: Assessing Your Current Situation
Evaluate where you stand and identify areas for improvement.

### Step 3: Creating Your Action Plan
Develop a strategic approach tailored to your specific needs.

## Best Practices and Pro Tips
1. **Start with clear objectives**
2. **Focus on quality over quantity**
3. **Measure and optimize continuously**
4. **Stay updated with latest trends**

## Common Mistakes to Avoid
• Rushing the implementation process
• Ignoring user feedback
• Underestimating resource requirements
• Failing to plan for scalability

## Conclusion
${prompt} represents a significant opportunity for growth and innovation. By following the strategies outlined in this guide, you'll be well-positioned to succeed.

**Ready to get started?** The time to act is now!

---
*Published with AI Content Creator Pro*`;
  }

  generateEmailTemplate(prompt, language, tone) {
    const prefix = language !== 'english' ? `[Content in ${language}]\n\n` : '';
    const toneNote = tone !== 'professional' ? `[${tone} tone]\n\n` : '';
    
    return `${prefix}${toneNote}Subject: 🚀 Transform Your Approach to ${prompt} (Limited Time)

Hi [Name],

I hope this email finds you well. I'm reaching out because I believe you'd be interested in the latest developments around ${prompt}.

**Here's what's happening:**

The industry is rapidly evolving, and those who adapt quickly are seeing remarkable results. Companies implementing ${prompt} strategies are reporting:

✅ Increased efficiency by 40%
✅ Higher customer satisfaction scores
✅ Significant competitive advantages

**But here's the challenge...**

Most organizations are still struggling with outdated approaches. They're missing out on incredible opportunities because they haven't embraced ${prompt}.

**The good news?**

You don't have to be one of them. We've developed a proven framework that makes ${prompt} implementation straightforward and effective.

**What makes this different:**
• Step-by-step guidance
• Proven results
• Ongoing support
• Risk-free guarantee

**Ready to learn more?**

I'd love to show you exactly how this works. Would you be available for a brief 15-minute call this week?

Simply reply to this email with your preferred time, and I'll send over a calendar link.

Best regards,
[Your Name]

P.S. This opportunity won't be available forever. The companies that act now will have a significant head start over their competition.

---
*Crafted with AI Content Creator Pro*`;
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  }

  // Analytics method
  getStats() {
    const stats = cache.getStats();
    return {
      cacheHits: stats.hits,
      cacheMisses: stats.misses,
      cacheKeys: stats.keys,
      providers: this.providers.map(p => ({
        name: p.name,
        enabled: p.enabled,
        url: p.url
      }))
    };
  }
}

module.exports = new AIService();