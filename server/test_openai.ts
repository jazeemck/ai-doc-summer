import * as openai from 'openai';
console.log('OpenAI version:', (openai.default && (openai.default as any).VERSION) || 'unknown');
console.log('OpenAI export names:', Object.keys(openai));
