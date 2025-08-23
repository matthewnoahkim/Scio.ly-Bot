/**
 * 🗝️ Gemini API Key Manager
 * 
 * This module manages multiple Gemini API keys for load balancing and rate limit handling.
 * It rotates through keys in a round-robin fashion and tracks usage statistics.
 */

class KeyManager {
  constructor() {
    this.keys = [];
    this.currentIndex = 0;
    this.usageStats = {};
    this.requestCount = 0;
    this.rotationInterval = 5; // Rotate every 5 prompts
    
    this.loadKeys();
    console.log(`Key Manager initialized with ${this.keys.length} keys`);
  }

  loadKeys() {
    if (process.env.GEMINI_API_KEY) {
      const keyArray = process.env.GEMINI_API_KEY.split(',').map(key => key.trim());
      this.keys.push(...keyArray.filter(key => key && key.length > 0));
    }

    this.keys = [...new Set(this.keys)];

    this.keys.forEach((key, index) => {
      this.usageStats[index] = {
        requests: 0,
        errors: 0,
        lastUsed: null,
        successRate: 100
      };
    });

    console.log(`Loaded ${this.keys.length} unique API keys`);
  }

  getNextKey() {
    if (this.keys.length === 0) {
      throw new Error('No Gemini API keys available. Please add GEMINI_API_KEY to your environment variables.');
    }

    if (this.requestCount > 0 && this.requestCount % this.rotationInterval === 0) {
      this.rotateKey();
    }

    const keyIndex = this.currentIndex;
    const key = this.keys[keyIndex];
    
    this.usageStats[keyIndex].requests++;
    this.usageStats[keyIndex].lastUsed = Date.now();
    this.requestCount++;

    console.log(`Using key ${keyIndex + 1}/${this.keys.length} (${this.getKeyPreview(key)}) - Request ${this.requestCount}`);
    
    return {
      key,
      keyIndex,
      keyNumber: keyIndex + 1,
      totalKeys: this.keys.length
    };
  }

  rotateKey() {
    const oldIndex = this.currentIndex;
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    
    console.log(`Rotating from key ${oldIndex + 1} to key ${this.currentIndex + 1} (after ${this.rotationInterval} prompts)`);
  }

  reportResult(keyIndex, success) {
    if (this.usageStats[keyIndex]) {
      if (!success) {
        this.usageStats[keyIndex].errors++;
      }
      
      const totalRequests = this.usageStats[keyIndex].requests;
      const errors = this.usageStats[keyIndex].errors;
      this.usageStats[keyIndex].successRate = totalRequests > 0 ? 
        ((totalRequests - errors) / totalRequests) * 100 : 100;
    }
  }

  getKeyPreview(key) {
    return key ? `${key.substring(0, 10)}...` : 'invalid';
  }

  getStats() {
    return {
      totalKeys: this.keys.length,
      currentKey: this.currentIndex + 1,
      totalRequests: this.requestCount,
      usageStats: this.usageStats,
      lastRotation: this.lastRotation
    };
  }

  printStatus() {
    console.log('\nGemini API Key Manager Status:');
    console.log(`Total Keys: ${this.keys.length}`);
    console.log(`Current Key: ${this.currentIndex + 1}`);
    console.log(`Total Requests: ${this.requestCount}`);
    console.log(`Rotation: Every ${this.rotationInterval} prompts`);
    
    if (this.keys.length > 1) {
      console.log('Key Usage Statistics:');
      Object.entries(this.usageStats).forEach(([index, stats]) => {
        const keyNum = parseInt(index) + 1;
        const keyPreview = this.getKeyPreview(this.keys[index]);
        console.log(`  Key ${keyNum} (${keyPreview}): ${stats.requests} requests, ${stats.successRate.toFixed(1)}% success`);
      });
    }
    console.log('');
  }

  hasMultipleKeys() {
    return this.keys.length > 1;
  }

  getKeyCount() {
    return this.keys.length;
  }
}

// Create a singleton instance
const keyManager = new KeyManager();

module.exports = keyManager;
