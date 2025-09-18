const express = require('express');
const { Client } = require('pg');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

// Configuration
const FUB_API_KEY = process.env.FUB_API_KEY || 'fka_0DxOlS07NmHLDLVjKXB7N9qJyOSM4QtM2u';
const FUB_SYSTEM_KEY = process.env.FUB_SYSTEM_KEY || '390b59dea776f1d5216843d3dfd5a127';
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || 'https://web-production-cd698.up.railway.app';

// Statistics tracking
const stats = {
    webhooks_received: 0,
    webhooks_processed: 0,
    webhooks_deduplicated: 0,
    stage_changes_captured: 0,
    errors: 0,
    uptime_start: new Date(),
    last_webhook_time: null,
    success_rate: 0.0
};

// Webhook deduplication tracking
const webhook_dedup_window = 30000; // 30 seconds
const person_webhook_tracking = new Map();

function extractLeadSourceTag(tags) {
    /**
     * Extract specific lead source tag from tags array
     * Returns 'ReadyMode', 'Roor', or null
     */
    if (!tags || !Array.isArray(tags)) {
        return null;
    }

    if (tags.includes("ReadyMode")) {
        return "ReadyMode";
    } else if (tags.includes("Roor")) {
        return "Roor";
    }

    return null;
}

function extractPersonId(webhookData) {
    // Extract person ID from webhook data
    if (webhookData.uri && webhookData.uri.includes('/people/')) {
        const personId = webhookData.uri.split('/people/')[1].split('/')[0];
        return personId;
    }

    // Try from data payload
    if (webhookData.data && webhookData.data.people && webhookData.data.people.length > 0) {
        const person = webhookData.data.people[0];
        if (person.id) {
            return String(person.id);
        }
    }

    return null;
}

function cleanupWebhookTracking() {
    const currentTime = Date.now();
    for (const [personId, timestamps] of person_webhook_tracking.entries()) {
        const recentTimestamps = timestamps.filter(time => currentTime - time < webhook_dedup_window * 2);
        if (recentTimestamps.length === 0) {
            person_webhook_tracking.delete(personId);
        } else {
            person_webhook_tracking.set(personId, recentTimestamps);
        }
    }
}

function shouldDeduplicateWebhook(personId) {
    const currentTime = Date.now();

    if (!person_webhook_tracking.has(personId)) {
        person_webhook_tracking.set(personId, []);
    }

    const personWebhooks = person_webhook_tracking.get(personId);

    // Clean old webhooks outside dedup window
    const recentWebhooks = personWebhooks.filter(time => currentTime - time < webhook_dedup_window);
    person_webhook_tracking.set(personId, recentWebhooks);

    // If more than 2 webhooks in the dedup window, this might be spam
    if (recentWebhooks.length >= 2) {
        console.log(`🔄 Deduplicating rapid webhook for person ${personId} (recent: ${recentWebhooks.length})`);
        stats.webhooks_deduplicated++;
        return true;
    }

    // Add current timestamp
    recentWebhooks.push(currentTime);
    person_webhook_tracking.set(personId, recentWebhooks);

    return false;
}

async function getFubPersonData(personId) {
    try {
        const auth = Buffer.from(`${FUB_API_KEY}:`).toString('base64');
        const response = await axios.get(`https://api.followupboss.com/v1/people/${personId}`, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'X-System': 'SynergyFUBLeadMetrics',
                'X-System-Key': FUB_SYSTEM_KEY,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        if (response.status === 200) {
            return response.data.person || response.data;
        }

        console.log(`❌ Error getting person ${personId}: ${response.status}`);
        return null;
    } catch (error) {
        console.log(`❌ Exception getting person ${personId}: ${error.message}`);
        return null;
    }
}

async function processPersonStageChange(personData, eventType) {
    const client = new Client({
        connectionString: SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();

        const personId = String(personData.id || '');
        const currentStage = personData.stage || 'Unknown';
        const firstName = personData.firstName || 'Unknown';
        const lastName = personData.lastName || 'Unknown';

        // Enhanced lead source extraction with debugging
        const tags = personData.tags || [];
        const leadSourceTag = extractLeadSourceTag(tags);

        // Debug logging for lead source extraction
        const personName = `${firstName} ${lastName}`;
        if (leadSourceTag) {
            console.log(`✅ Lead source extracted for ${personName}: ${leadSourceTag} from tags: ${JSON.stringify(tags)}`);
        } else {
            console.log(`⚠️  No lead source found for ${personName}, tags: ${JSON.stringify(tags)}`);
        }

        // Begin transaction with SELECT FOR UPDATE to lock person record during stage check
        await client.query('BEGIN');

        const lastStageResult = await client.query(`
            SELECT stage_to, changed_at
            FROM stage_changes
            WHERE person_id = $1
            ORDER BY changed_at DESC
            LIMIT 1
            FOR UPDATE
        `, [personId]);

        const lastRecordedStage = lastStageResult.rows.length > 0 ? lastStageResult.rows[0].stage_to : null;

        // Check if this is actually a stage change
        if (lastRecordedStage === currentStage) {
            console.log(`🔄 No stage change for ${personName}: already in ${currentStage}`);
            await client.query('ROLLBACK');
            return false;
        }

        console.log(`🎯 STAGE CHANGE DETECTED for ${personName}: ${lastRecordedStage || 'NEW'} → ${currentStage}`);

        // Insert new stage change record
        await client.query(`
            INSERT INTO stage_changes (
                person_id, first_name, last_name, stage_from, stage_to,
                changed_at, received_at, source, lead_source_tag,
                deal_id, campaign_id, who_pushed_lead, parcel_county, parcel_state
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `, [
            personId,
            firstName,
            lastName,
            lastRecordedStage,
            currentStage,
            new Date(), // changed_at
            new Date(), // received_at
            `webhook_${eventType}`, // source
            leadSourceTag, // lead_source_tag
            personData.dealId || null,
            personData.customCampaignID || null,
            personData.customWhoPushedTheLead || null,
            personData.customParcelCounty || null,
            personData.customParcelState || null
        ]);

        // Commit transaction
        await client.query('COMMIT');
        console.log(`✅ Stage change saved: ${personName} → ${currentStage}`);
        return true;

    } catch (error) {
        await client.query('ROLLBACK');
        console.log(`❌ Database transaction failed for ${personData.firstName || 'Unknown'}: ${error.message}`);
        return false;
    } finally {
        await client.end();
    }
}

// Health check endpoint
app.get('/health', (req, res) => {
    const uptimeHours = (Date.now() - stats.uptime_start.getTime()) / (1000 * 60 * 60);

    res.json({
        status: 'healthy',
        healthy: true,
        uptime_hours: Math.round(uptimeHours * 100) / 100,
        webhooks_received: stats.webhooks_received,
        webhooks_processed: stats.webhooks_processed,
        webhooks_deduplicated: stats.webhooks_deduplicated,
        stage_changes_captured: stats.stage_changes_captured,
        queue_size: 0, // Real-time processing, no queue
        success_rate: Math.round(stats.success_rate * 10) / 10,
        errors: stats.errors,
        last_webhook_time: stats.last_webhook_time ? stats.last_webhook_time.toISOString() : null,
        dedup_window_seconds: webhook_dedup_window / 1000,
        tracked_people: person_webhook_tracking.size
    });
});

// Stats endpoint
app.get('/stats', (req, res) => {
    const health = req.app.locals.getHealth();
    res.json({
        health: health,
        timestamp: new Date().toISOString()
    });
});

// Main webhook endpoint for FUB stage changes
app.post('/webhook/fub/stage-change', async (req, res) => {
    try {
        const webhookData = req.body;
        if (!webhookData) {
            return res.status(400).json({ error: 'No JSON payload' });
        }

        stats.webhooks_received++;
        stats.last_webhook_time = new Date();

        // Extract person ID
        const personId = extractPersonId(webhookData);
        if (!personId) {
            console.log(`⚠️  No person ID found in webhook: ${JSON.stringify(webhookData)}`);
            return res.status(400).json({ error: 'No person ID found in webhook' });
        }

        const eventType = webhookData.event || 'unknown';
        console.log(`📡 Incoming webhook: ${eventType} for person ${personId}`);

        // Check for rapid webhooks (deduplication)
        if (shouldDeduplicateWebhook(personId)) {
            return res.json({
                status: 'rejected',
                message: 'Webhook rejected (duplicate)'
            });
        }

        // Get person data from FUB API
        const personData = await getFubPersonData(personId);
        if (!personData) {
            stats.errors++;
            return res.status(500).json({ error: 'Could not fetch person data' });
        }

        // Process stage change
        const success = await processPersonStageChange(personData, eventType);

        stats.webhooks_processed++;
        if (success) {
            stats.stage_changes_captured++;
        }

        // Update success rate
        if (stats.webhooks_processed > 0) {
            stats.success_rate = (stats.stage_changes_captured / stats.webhooks_processed) * 100;
        }

        res.json({
            status: success ? 'accepted' : 'processed',
            message: success ? 'Stage change captured' : 'No stage change detected'
        });

    } catch (error) {
        console.log(`❌ Webhook handling error: ${error.message}`);
        stats.errors++;
        res.status(500).json({ error: 'Internal server error' });
    }
});

// List webhooks endpoint
app.get('/list-webhooks', async (req, res) => {
    try {
        const auth = Buffer.from(`${FUB_API_KEY}:`).toString('base64');
        const response = await axios.get('https://api.followupboss.com/v1/webhooks', {
            headers: {
                'Authorization': `Basic ${auth}`,
                'X-System': 'SynergyFUBLeadMetrics',
                'X-System-Key': FUB_SYSTEM_KEY,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        const webhooks = response.data.webhooks || [];
        res.json({
            webhooks: webhooks,
            count: webhooks.length
        });
    } catch (error) {
        console.log(`❌ Error listing webhooks: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Register webhook endpoint
app.post('/register-webhook', async (req, res) => {
    try {
        const { event = 'peopleStageUpdated' } = req.body;
        const url = `${WEBHOOK_BASE_URL}/webhook/fub/stage-change`;

        const auth = Buffer.from(`${FUB_API_KEY}:`).toString('base64');
        const response = await axios.post('https://api.followupboss.com/v1/webhooks', {
            event: event,
            url: url
        }, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'X-System': 'SynergyFUBLeadMetrics',
                'X-System-Key': FUB_SYSTEM_KEY,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        if (response.status === 201) {
            res.status(201).json(response.data);
        } else {
            res.status(500).json({ error: 'Failed to register webhook' });
        }
    } catch (error) {
        console.log(`❌ Error registering webhook: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'FUB Webhook Server',
        status: 'running',
        version: '2.0',
        architecture: 'Node.js/Express',
        endpoints: [
            '/health',
            '/stats',
            '/webhook/fub/stage-change',
            '/list-webhooks',
            '/register-webhook'
        ]
    });
});

// Cleanup tracking data every 5 minutes
setInterval(cleanupWebhookTracking, 5 * 60 * 1000);

// Store health function in app locals for stats endpoint
app.locals.getHealth = () => {
    const uptimeHours = (Date.now() - stats.uptime_start.getTime()) / (1000 * 60 * 60);
    return {
        status: 'healthy',
        healthy: true,
        uptime_hours: Math.round(uptimeHours * 100) / 100,
        webhooks_received: stats.webhooks_received,
        webhooks_processed: stats.webhooks_processed,
        webhooks_deduplicated: stats.webhooks_deduplicated,
        stage_changes_captured: stats.stage_changes_captured,
        queue_size: 0,
        success_rate: Math.round(stats.success_rate * 10) / 10,
        errors: stats.errors,
        last_webhook_time: stats.last_webhook_time ? stats.last_webhook_time.toISOString() : null,
        dedup_window_seconds: webhook_dedup_window / 1000,
        tracked_people: person_webhook_tracking.size
    };
};

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 FUB Webhook Server v2.0 (Node.js) started');
    console.log(`📡 Webhook endpoint: ${WEBHOOK_BASE_URL}/webhook/fub/stage-change`);
    console.log(`🔗 FUB API configured: ${FUB_API_KEY ? '✅' : '❌'}`);
    console.log(`💾 Database configured: ${SUPABASE_DB_URL ? '✅' : '❌'}`);
    console.log(`🌐 Server listening on port ${PORT}`);
});