// pages/api/webhook.js
// FUB Stage Change Webhook Handler

import { Client } from 'pg';

// Extract lead source tag from tags array
function extractLeadSourceTag(tags) {
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const webhookData = req.body;
    if (!webhookData) {
      return res.status(400).json({ error: 'No JSON payload' });
    }

    // Extract person ID from webhook
    let personId = null;
    if (webhookData.uri && webhookData.uri.includes('/people/')) {
      personId = webhookData.uri.split('/people/')[1].split('/')[0];
    }

    if (!personId) {
      console.log('⚠️  No person ID found in webhook:', webhookData);
      return res.status(400).json({ error: 'No person ID found in webhook' });
    }

    const eventType = webhookData.event || 'unknown';
    console.log(`📡 Incoming webhook: ${eventType} for person ${personId}`);

    // Get person data from FUB API
    const auth = Buffer.from(`${process.env.FUB_API_KEY}:`).toString('base64');
    const response = await fetch(`https://api.followupboss.com/v1/people/${personId}`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'X-System': 'SynergyFUBLeadMetrics',
        'X-System-Key': process.env.FUB_SYSTEM_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.log(`❌ Error getting person ${personId}: ${response.status}`);
      return res.status(500).json({ error: 'Could not fetch person data' });
    }

    const personResponse = await response.json();
    const personData = personResponse.person || personResponse;

    // Process stage change with database
    const client = new Client({
      connectionString: process.env.SUPABASE_DB_URL,
      ssl: { rejectUnauthorized: false }
    });

    try {
      await client.connect();

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
        return res.json({
          status: 'processed',
          message: 'No stage change detected'
        });
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
        `wh_${eventType}`.substring(0, 20), // source (truncated to fit varchar(20))
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

      return res.json({
        status: 'accepted',
        message: 'Stage change captured successfully',
        personName: personName,
        stageChange: `${lastRecordedStage || 'NEW'} → ${currentStage}`,
        leadSource: leadSourceTag
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.log(`❌ Database transaction failed for ${personData.firstName || 'Unknown'}: ${error.message}`);
      return res.status(500).json({ error: 'Database transaction failed' });
    } finally {
      await client.end();
    }

  } catch (error) {
    console.error('Webhook handling error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}