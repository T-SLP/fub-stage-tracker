// register-webhooks.js
// Script to register webhooks with Follow Up Boss after Vercel deployment

const https = require('https');

// Configuration - update these after deployment
const WEBHOOK_BASE_URL = 'https://your-vercel-app.vercel.app'; // Update this with your Vercel URL
const FUB_API_KEY = process.env.FUB_API_KEY;
const FUB_SYSTEM_KEY = process.env.FUB_SYSTEM_KEY;

const RELEVANT_WEBHOOK_EVENTS = [
  'peopleStageUpdated',  // Most important - direct stage changes
  'peopleCreated',       // New leads
  'peopleUpdated',       // General updates that might include stage changes
  'peopleTagsCreated'    // Tag changes (for lead source tracking)
];

function registerWebhook(event) {
  return new Promise((resolve, reject) => {
    const webhookUrl = `${WEBHOOK_BASE_URL}/api/webhook`;
    const authHeader = Buffer.from(`${FUB_API_KEY}:`).toString('base64');
    
    const postData = JSON.stringify({
      event: event,
      url: webhookUrl
    });

    const options = {
      hostname: 'api.followupboss.com',
      port: 443,
      path: '/v1/webhooks',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Basic ${authHeader}`,
        'X-System': 'SynergyFUBLeadMetrics',
        'X-System-Key': FUB_SYSTEM_KEY
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 201) {
          const webhookData = JSON.parse(data);
          console.log(`✅ Successfully registered ${event} webhook (ID: ${webhookData.id})`);
          resolve(webhookData);
        } else if (res.statusCode === 400 && data.toLowerCase().includes('already exists')) {
          console.log(`ℹ️  ${event} webhook already exists`);
          resolve({ message: 'already exists' });
        } else {
          console.error(`❌ Failed to register ${event} webhook: ${res.statusCode} - ${data}`);
          reject(new Error(`Registration failed: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error(`❌ Network error registering ${event} webhook:`, error);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

async function registerAllWebhooks() {
  if (!FUB_API_KEY || !FUB_SYSTEM_KEY) {
    console.error('❌ Missing FUB_API_KEY or FUB_SYSTEM_KEY environment variables');
    process.exit(1);
  }

  if (WEBHOOK_BASE_URL.includes('your-vercel-app')) {
    console.error('❌ Please update WEBHOOK_BASE_URL with your actual Vercel deployment URL');
    process.exit(1);
  }

  console.log(`🚀 Registering webhooks with URL: ${WEBHOOK_BASE_URL}/api/webhook`);
  console.log('');

  let successCount = 0;

  for (const event of RELEVANT_WEBHOOK_EVENTS) {
    try {
      await registerWebhook(event);
      successCount++;
      
      // Rate limiting between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Failed to register ${event}:`, error.message);
    }
  }

  console.log('');
  console.log(`📊 Webhook registration complete: ${successCount}/${RELEVANT_WEBHOOK_EVENTS.length} successful`);
  
  if (successCount > 0) {
    console.log('');
    console.log('✅ Your webhook system is now active!');
    console.log(`Health check: ${WEBHOOK_BASE_URL}/api/webhook-health`);
  }
}

// Run the registration
registerAllWebhooks().catch(console.error);