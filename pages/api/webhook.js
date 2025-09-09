// pages/api/webhook.js
import { Client } from 'pg';
import crypto from 'crypto';

// Configuration
const FUB_API_KEY = process.env.FUB_API_KEY;
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;
const FUB_SYSTEM_KEY = process.env.FUB_SYSTEM_KEY;

// Relevant webhook events for stage tracking
const RELEVANT_WEBHOOK_EVENTS = [
  'peopleStageUpdated',  // Most important - direct stage changes
  'peopleCreated',       // New leads
  'peopleUpdated',       // General updates that might include stage changes
  'peopleTagsCreated'    // Tag changes (for lead source tracking)
];

// Utility functions
function extractCustomFields(person) {
  return {
    campaign_id: person.customCampaignID || null,
    who_pushed_lead: person.customWhoPushedTheLead || null,
    parcel_county: person.customParcelCounty || null,
    parcel_state: person.customParcelState || null
  };
}

function extractLeadSourceTag(tags) {
  if (!tags || !Array.isArray(tags)) return null;
  if (tags.includes("ReadyMode")) return "ReadyMode";
  if (tags.includes("Roor")) return "Roor";
  return null;
}

function getStagePriority(stageName) {
  const STANDARD_FUB_STAGES = [
    "Contact Upload", "ACQ - New Lead", "ACQ - Attempted Contact",
    "ACQ - Contacted", "ACQ - Qualified", "ACQ - Offers Made",
    "ACQ - Price Motivated", "ACQ - Under Contract", "ACQ - Closed Won",
    "ACQ - Closed Lost", "ACQ - On Hold", "ACQ - Not Qualified"
  ];
  
  const index = STANDARD_FUB_STAGES.indexOf(stageName);
  return index === -1 ? 999 : index;
}

function calculateTimeInStage(stageFromTimestamp, stageToTimestamp) {
  if (!stageFromTimestamp || !stageToTimestamp) {
    return { days: 0.0, hours: 0, minutes: 0 };
  }

  const timeDiff = new Date(stageToTimestamp) - new Date(stageFromTimestamp);
  const totalSeconds = timeDiff / 1000;

  const daysFloat = totalSeconds / (24 * 60 * 60);
  const hoursInt = Math.floor(totalSeconds / 3600);
  const minutesInt = Math.floor((totalSeconds % 3600) / 60);

  return {
    days: Math.round(daysFloat * 100) / 100,
    hours: hoursInt,
    minutes: minutesInt
  };
}

// FUB signature verification
function verifyFubSignature(payload, signature) {
  if (!FUB_SYSTEM_KEY || !signature) {
    console.warn("FUB signature verification skipped - missing system key or signature");
    return true; // Skip if not configured, but log warning
  }

  try {
    // Step 1: Base64 encode the raw JSON payload
    const encodedPayload = Buffer.from(payload).toString('base64');
    
    // Step 2: Create HMAC-SHA256 with encoded payload and system key
    const expected = crypto
      .createHmac('sha256', FUB_SYSTEM_KEY)
      .update(encodedPayload)
      .digest('hex');

    // Use timing-safe comparison
    const isValid = crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature, 'hex')
    );

    if (!isValid) {
      console.error(`FUB signature mismatch. Expected: ${expected}, Got: ${signature}`);
    }

    return isValid;
  } catch (error) {
    console.error(`Error verifying FUB signature: ${error}`);
    return false;
  }
}

// Fetch person data from FUB API
async function fetchFubResource(resourceUri) {
  try {
    const separator = resourceUri.includes('?') ? '&' : '?';
    const fullUri = `https://api.followupboss.com${resourceUri}${separator}fields=allFields`;

    const authHeader = Buffer.from(`${FUB_API_KEY}:`).toString('base64');
    const headers = {
      'Authorization': `Basic ${authHeader}`,
      'X-System': 'SynergyFUBLeadMetrics'
    };

    if (FUB_SYSTEM_KEY) {
      headers['X-System-Key'] = FUB_SYSTEM_KEY;
    }

    const response = await fetch(fullUri, {
      method: 'GET',
      headers,
      timeout: 30000
    });

    if (response.ok) {
      return await response.json();
    } else {
      console.error(`Failed to fetch FUB resource: ${response.status} - ${await response.text()}`);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching FUB resource: ${error}`);
    return null;
  }
}

// Database operations
async function getConnection() {
  if (!SUPABASE_DB_URL) {
    throw new Error("SUPABASE_DB_URL not configured");
  }
  
  const client = new Client({
    connectionString: SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  await client.connect();
  return client;
}

async function ensureEnhancedSchema(client) {
  const enhancedColumns = [
    ['time_in_previous_stage_days', 'NUMERIC(10,2)'],
    ['time_in_previous_stage_hours', 'INTEGER'],
    ['time_in_previous_stage_minutes', 'INTEGER'],
    ['previous_stage_entered_at', 'TIMESTAMP'],
    ['stage_priority_from', 'INTEGER'],
    ['stage_priority_to', 'INTEGER'],
    ['is_forward_progression', 'BOOLEAN']
  ];

  for (const [columnName, columnType] of enhancedColumns) {
    try {
      await client.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name='stage_changes' AND column_name='${columnName}'
          ) THEN
            ALTER TABLE stage_changes ADD COLUMN ${columnName} ${columnType};
          END IF;
        END $$;
      `);
    } catch (error) {
      console.warn(`Could not add column ${columnName}: ${error}`);
    }
  }

  // Create indexes for better performance
  try {
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_stage_changes_time_tracking 
      ON stage_changes(person_id, changed_at, time_in_previous_stage_days)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_stage_changes_webhook_source 
      ON stage_changes(source, changed_at) WHERE source LIKE 'webhook_%'
    `);
  } catch (error) {
    console.warn(`Could not create indexes: ${error}`);
  }
}

async function getPersonLastStage(client, personId) {
  try {
    const result = await client.query(
      `SELECT stage_to, changed_at FROM stage_changes 
       WHERE person_id = $1 
       ORDER BY changed_at DESC 
       LIMIT 1`,
      [personId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error(`Error getting last stage: ${error}`);
    return null;
  }
}

async function getPersonStageHistory(client, personId) {
  try {
    const result = await client.query(
      `SELECT stage_from, stage_to, changed_at, source
       FROM stage_changes 
       WHERE person_id = $1 
       ORDER BY changed_at ASC`,
      [personId]
    );
    return result.rows;
  } catch (error) {
    console.error(`Error getting stage history: ${error}`);
    return [];
  }
}

function createStageChangeRecord(person, stageFrom, stageTo, eventType) {
  const customFields = extractCustomFields(person);
  const leadSourceTag = extractLeadSourceTag(person.tags);
  const currentTime = new Date().toISOString();

  return {
    person_id: String(person.id || ''),
    deal_id: person.dealId || null,
    first_name: person.firstName || null,
    last_name: person.lastName || null,
    stage_from: stageFrom || 'Unknown',
    stage_to: stageTo,
    changed_at: currentTime,
    received_at: currentTime,
    source: `webhook_${eventType}`,
    event_id: `webhook_${person.id}_${Date.now()}`,
    raw_payload: JSON.stringify(person),
    campaign_id: customFields.campaign_id,
    who_pushed_lead: customFields.who_pushed_lead,
    parcel_county: customFields.parcel_county,
    parcel_state: customFields.parcel_state,
    lead_source_tag: leadSourceTag,
    time_in_previous_stage_days: 0.0,
    time_in_previous_stage_hours: 0,
    time_in_previous_stage_minutes: 0,
    previous_stage_entered_at: null,
    stage_priority_from: null,
    stage_priority_to: null,
    is_forward_progression: null
  };
}

async function addTimeTrackingData(client, stageChangeData) {
  try {
    const personId = stageChangeData.person_id;
    const stageFrom = stageChangeData.stage_from;

    if (stageFrom && stageFrom !== 'Unknown') {
      const stageHistory = await getPersonStageHistory(client, personId);

      if (stageHistory.length > 0) {
        // Find when they entered the previous stage
        for (let i = stageHistory.length - 1; i >= 0; i--) {
          const entry = stageHistory[i];
          if (entry.stage_to === stageFrom) {
            const timeData = calculateTimeInStage(entry.changed_at, stageChangeData.changed_at);
            
            stageChangeData.time_in_previous_stage_days = timeData.days;
            stageChangeData.time_in_previous_stage_hours = timeData.hours;
            stageChangeData.time_in_previous_stage_minutes = timeData.minutes;
            stageChangeData.previous_stage_entered_at = entry.changed_at;

            if (timeData.days < 1 && timeData.hours < 1) {
              console.log(`⚡ RAPID TRANSITION: ${stageChangeData.first_name} ${stageChangeData.last_name} spent ${timeData.minutes} minutes in ${stageFrom}`);
            }
            break;
          }
        }
      }
    }

    // Add progression analysis
    const priorityFrom = getStagePriority(stageChangeData.stage_from);
    const priorityTo = getStagePriority(stageChangeData.stage_to);
    
    stageChangeData.stage_priority_from = priorityFrom;
    stageChangeData.stage_priority_to = priorityTo;
    stageChangeData.is_forward_progression = priorityTo > priorityFrom;

  } catch (error) {
    console.error(`Error adding time tracking data: ${error}`);
  }
}

async function saveStageChange(client, stageChangeData) {
  try {
    await ensureEnhancedSchema(client);

    const query = `
      INSERT INTO stage_changes (
        person_id, deal_id, first_name, last_name,
        stage_from, stage_to, changed_at, received_at, 
        source, event_id, raw_payload,
        campaign_id, who_pushed_lead, parcel_county, parcel_state, lead_source_tag,
        time_in_previous_stage_days, time_in_previous_stage_hours, time_in_previous_stage_minutes,
        previous_stage_entered_at, stage_priority_from, stage_priority_to, is_forward_progression
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
      )
      ON CONFLICT (event_id) DO NOTHING
      RETURNING id
    `;

    const values = [
      stageChangeData.person_id, stageChangeData.deal_id, stageChangeData.first_name, stageChangeData.last_name,
      stageChangeData.stage_from, stageChangeData.stage_to, stageChangeData.changed_at, stageChangeData.received_at,
      stageChangeData.source, stageChangeData.event_id, stageChangeData.raw_payload,
      stageChangeData.campaign_id, stageChangeData.who_pushed_lead, stageChangeData.parcel_county, 
      stageChangeData.parcel_state, stageChangeData.lead_source_tag,
      stageChangeData.time_in_previous_stage_days, stageChangeData.time_in_previous_stage_hours, 
      stageChangeData.time_in_previous_stage_minutes, stageChangeData.previous_stage_entered_at,
      stageChangeData.stage_priority_from, stageChangeData.stage_priority_to, stageChangeData.is_forward_progression
    ];

    const result = await client.query(query, values);
    return result.rowCount > 0;
  } catch (error) {
    console.error(`Error saving stage change: ${error}`);
    return false;
  }
}

async function processPersonStageChange(person, eventType) {
  const personId = String(person.id || '');
  const currentStage = person.stage;

  if (!personId || !currentStage) {
    return false;
  }

  // Skip "Contact Upload" stage as it's not meaningful for tracking
  if (currentStage === "Contact Upload") {
    return false;
  }

  let client;
  try {
    client = await getConnection();
    await client.query('BEGIN');

    // Get last known stage with FOR UPDATE lock
    const result = await client.query(
      `SELECT stage_to, changed_at FROM stage_changes 
       WHERE person_id = $1 
       ORDER BY changed_at DESC 
       LIMIT 1
       FOR UPDATE`,
      [personId]
    );

    const lastRecord = result.rows[0];
    const lastKnownStage = lastRecord?.stage_to || null;
    const lastChangeTime = lastRecord?.changed_at || null;

    // Check if this is actually a stage change
    if (lastKnownStage !== currentStage) {
      console.log(`STAGE CHANGE DETECTED: ${person.firstName} ${person.lastName} - ${lastKnownStage || 'NEW'} → ${currentStage}`);
      
      // Create the stage change record
      const stageChangeData = createStageChangeRecord(person, lastKnownStage, currentStage, eventType);
      
      if (stageChangeData) {
        // Add time-in-stage calculations
        if (lastChangeTime) {
          stageChangeData.previous_stage_timestamp = lastChangeTime;
        }
        await addTimeTrackingData(client, stageChangeData);

        // Save within the same transaction
        const success = await saveStageChange(client, stageChangeData);
        
        if (success) {
          await client.query('COMMIT');
          console.log(`✅ Stage change saved: ${person.firstName} ${person.lastName} - ${lastKnownStage || 'NEW'} → ${currentStage}`);
          return true;
        } else {
          await client.query('ROLLBACK');
          console.error(`❌ Failed to save stage change for ${person.firstName} ${person.lastName}`);
          return false;
        }
      }
    } else {
      await client.query('COMMIT');
      // Not a stage change, but log for peopleStageUpdated events
      if (eventType === 'peopleStageUpdated') {
        console.log(`peopleStageUpdated webhook but no change: ${person.firstName} ${person.lastName} (still ${currentStage})`);
      }
      return false;
    }

  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error(`Error in stage change processing: ${error}`);
    return false;
  } finally {
    if (client) {
      await client.end();
    }
  }
}

async function processWebhookEvent(webhookData) {
  try {
    const eventType = webhookData.event;
    const resourceUri = webhookData.uri;

    if (!resourceUri) {
      console.log(`No resource URI for ${eventType} webhook`);
      return true;
    }

    // Fetch the actual person data from FUB
    const personData = await fetchFubResource(resourceUri);
    if (!personData) {
      return false;
    }

    // Process each person for stage changes
    let peopleList = personData.people || [];
    if (!peopleList.length && personData.id) {
      peopleList = [personData];
    }

    let totalProcessed = 0;
    for (const person of peopleList) {
      if (await processPersonStageChange(person, eventType)) {
        totalProcessed++;
      }
    }

    if (totalProcessed > 0) {
      console.log(`Processed ${totalProcessed} people from ${eventType} webhook`);
    }

    return true;

  } catch (error) {
    console.error(`Error processing webhook event: ${error}`);
    return false;
  }
}

// Main webhook handler
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get raw payload for signature verification
    const rawPayload = JSON.stringify(req.body);
    
    // Verify FUB signature
    const fubSignature = req.headers['fub-signature'];
    if (!verifyFubSignature(Buffer.from(rawPayload), fubSignature)) {
      console.error("Invalid FUB signature");
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const webhookData = req.body;
    if (!webhookData) {
      return res.status(400).json({ error: 'No JSON data' });
    }

    const eventType = webhookData.event || 'unknown';
    const resourceIds = webhookData.resourceIds || [];

    console.log(`Received FUB webhook: ${eventType} for ${resourceIds.length} people`);

    // Filter for relevant events only
    if (!RELEVANT_WEBHOOK_EVENTS.includes(eventType)) {
      console.log(`Ignoring non-stage event: ${eventType}`);
      return res.status(200).json({
        status: 'ignored',
        timestamp: new Date().toISOString(),
        event: eventType,
        message: 'Event type not relevant for stage tracking'
      });
    }

    // Process webhook asynchronously (don't wait for completion)
    setImmediate(() => {
      processWebhookEvent(webhookData).catch(error => {
        console.error(`Background webhook processing error: ${error}`);
      });
    });

    // Return success immediately (FUB requires response within 10 seconds)
    return res.status(200).json({
      status: 'received',
      timestamp: new Date().toISOString(),
      event: eventType,
      resource_count: resourceIds.length,
      queued: true
    });

  } catch (error) {
    console.error(`Webhook handler error: ${error}`);
    return res.status(500).json({ 
      status: 'error', 
      message: error.message 
    });
  }
}