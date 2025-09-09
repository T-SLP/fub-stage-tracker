// pages/api/webhook-health.js
// Health check endpoint for the webhook system

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check environment variables
    const config = {
      fub_api_configured: !!process.env.FUB_API_KEY,
      fub_system_key_configured: !!process.env.FUB_SYSTEM_KEY,
      database_configured: !!process.env.SUPABASE_DB_URL,
    };

    const isHealthy = config.fub_api_configured && config.database_configured;

    return res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      message: isHealthy ? 'Webhook system ready' : 'Configuration incomplete',
      timestamp: new Date().toISOString(),
      webhook_endpoint: '/api/webhook',
      configuration: config,
      capabilities: {
        real_time_webhooks: true,
        time_in_stage_tracking: true,
        rapid_transition_capture: true,
        enhanced_analytics: true
      }
    });

  } catch (error) {
    console.error('Webhook health check error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}