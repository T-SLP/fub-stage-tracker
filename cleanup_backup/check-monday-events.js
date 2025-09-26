// Check FUB Events API for Monday Sept 8 stage changes to "ACQ - Offers Made"
const { Client } = require('pg');
require('dotenv').config();

async function checkMondayEvents() {
    console.log('🔍 CHECKING: FUB Events API for Monday Sep 8 stage changes');
    console.log('=' .repeat(60));
    console.log('Looking for stage changes to "ACQ - Offers Made" even if brief\\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        
        console.log('📊 CURRENT DATABASE STATUS:');
        console.log('-'.repeat(40));
        
        const currentQuery = `
            SELECT 
                DATE(changed_at) as offer_date,
                COUNT(*) as offer_count,
                STRING_AGG(first_name || ' ' || last_name, ', ') as names
            FROM stage_changes 
            WHERE stage_to = 'ACQ - Offers Made'
              AND changed_at >= '2025-09-08'
              AND changed_at <= '2025-09-10 23:59:59'
            GROUP BY DATE(changed_at)
            ORDER BY offer_date;
        `;
        
        const currentResult = await client.query(currentQuery);
        
        currentResult.rows.forEach(row => {
            const date = new Date(row.offer_date);
            const dayName = date.toDateString();
            console.log(`📅 ${dayName}: ${row.offer_count} offers`);
            console.log(`   Names: ${row.names}`);
        });
        
        // Now check FUB Events API for Monday
        console.log('\\n🔍 FETCHING FROM FUB EVENTS API:');
        console.log('-'.repeat(35));
        
        const authHeader = Buffer.from(`${process.env.FUB_API_KEY}:`).toString('base64');
        
        // Check Monday Sept 8, 2025
        const mondayStart = '2025-09-08T00:00:00Z';
        const mondayEnd = '2025-09-08T23:59:59Z';
        
        console.log(`Checking events from ${mondayStart} to ${mondayEnd}...`);
        
        let allEvents = [];
        let offset = 0;
        const limit = 100;
        
        while (true) {
            try {
                // Try simpler Events API call first
                const response = await fetch(
                    `https://api.followupboss.com/v1/events?limit=${limit}&offset=${offset}`,
                    {
                        headers: {
                            'Authorization': `Basic ${authHeader}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                
                if (!response.ok) {
                    console.log(`FUB Events API response: ${response.status} ${response.statusText}`);
                    if (response.status === 400) {
                        console.log('Note: Events API might not support the filters used');
                    }
                    break;
                }
                
                const data = await response.json();
                const events = data.events || [];
                
                if (events.length === 0) break;
                
                allEvents.push(...events);
                offset += limit;
                
                console.log(`Fetched ${events.length} events (total: ${allEvents.length})`);
                
                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.error(`❌ Events API Error: ${error.message}`);
                break;
            }
        }
        
        console.log(`\\nTotal events fetched: ${allEvents.length}`);
        
        // First, let's see what types of events we have
        console.log('\\n📋 EVENT ANALYSIS:');
        console.log('-'.repeat(25));
        
        const eventTypes = {};
        const mondayEvents = [];
        
        allEvents.forEach(event => {
            eventTypes[event.type] = (eventTypes[event.type] || 0) + 1;
            
            // Check if event occurred on Monday
            const eventDate = new Date(event.occurred);
            const eventDateStr = eventDate.toISOString().split('T')[0];
            
            if (eventDateStr === '2025-09-08') {
                mondayEvents.push(event);
            }
        });
        
        console.log('Event types found:');
        Object.entries(eventTypes).forEach(([type, count]) => {
            console.log(`  "${type}": ${count} events`);
        });
        
        console.log(`\\nEvents on Monday Sep 8: ${mondayEvents.length}`);
        
        // Let's examine the structure of a few Monday events
        if (mondayEvents.length > 0) {
            console.log('\\n🔍 SAMPLE MONDAY EVENT STRUCTURE:');
            console.log('-'.repeat(40));
            const sampleEvent = mondayEvents[0];
            console.log('Sample event keys:', Object.keys(sampleEvent));
            console.log('Sample event:', JSON.stringify(sampleEvent, null, 2));
            
            // Check if there are any events with stage-related data
            const stageRelatedEvents = mondayEvents.filter(event => {
                const eventStr = JSON.stringify(event).toLowerCase();
                return eventStr.includes('stage') || eventStr.includes('offer');
            });
            
            console.log(`\\nStage-related events on Monday: ${stageRelatedEvents.length}`);
            if (stageRelatedEvents.length > 0) {
                console.log('Sample stage-related event:', JSON.stringify(stageRelatedEvents[0], null, 2));
            }
        }
        
        // Filter for stage changes to "ACQ - Offers Made" on Monday
        const offerEvents = mondayEvents.filter(event => 
            event.type === 'PersonStageChanged' && 
            event.data && 
            event.data.to === 'ACQ - Offers Made'
        );
        
        // Also check for other variations of the stage name
        const allStageChanges = mondayEvents.filter(event => 
            event.type === 'PersonStageChanged'
        );
        
        console.log(`\\nMonday stage changes: ${allStageChanges.length}`);
        if (allStageChanges.length > 0) {
            console.log('Monday stage changes found:');
            allStageChanges.slice(0, 10).forEach(event => {
                console.log(`  ${event.occurred}: ${event.data?.from} → ${event.data?.to}`);
            });
        }
        
        console.log(`\\n🎯 OFFERS MADE EVENTS ON MONDAY:`)
        console.log('-'.repeat(35));
        
        if (offerEvents.length === 0) {
            console.log('❌ No "ACQ - Offers Made" events found on Monday Sep 8');
            console.log('\\nPossible reasons:');
            console.log('1. Events API might not be available or configured');
            console.log('2. Different stage name used (check exact spelling)');
            console.log('3. Events occurred outside Monday date range');
            console.log('4. No offers were actually made Monday');
        } else {
            console.log(`✅ Found ${offerEvents.length} offer events on Monday:`);
            
            for (const event of offerEvents) {
                console.log(`\\n📋 Event: ${event.occurred}`);
                console.log(`   Person ID: ${event.data.personId}`);
                console.log(`   From: ${event.data.from} → To: ${event.data.to}`);
                
                // Try to get person details
                try {
                    const personResponse = await fetch(
                        `https://api.followupboss.com/v1/people/${event.data.personId}`,
                        {
                            headers: {
                                'Authorization': `Basic ${authHeader}`,
                                'Content-Type': 'application/json'
                            }
                        }
                    );
                    
                    if (personResponse.ok) {
                        const personData = await personResponse.json();
                        console.log(`   Name: ${personData.firstName} ${personData.lastName}`);
                        
                        // Check if this person is already in our database
                        const checkQuery = `
                            SELECT COUNT(*) as count 
                            FROM stage_changes 
                            WHERE person_id = $1 
                              AND stage_to = 'ACQ - Offers Made'
                              AND DATE(changed_at) = '2025-09-08'
                        `;
                        
                        const checkResult = await client.query(checkQuery, [event.data.personId]);
                        const exists = parseInt(checkResult.rows[0].count) > 0;
                        
                        console.log(`   In Database: ${exists ? '✅ Yes' : '❌ Missing'}`);
                        
                        if (!exists) {
                            console.log(`   🚨 MISSING FROM DATABASE!`);
                        }
                    }
                    
                    // Rate limiting for person API calls
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                } catch (personError) {
                    console.log(`   Name: Unable to fetch (${personError.message})`);
                }
            }
        }
        
        console.log('\\n' + '='.repeat(60));
        console.log('📊 MONDAY EVENTS CHECK COMPLETE');
        if (offerEvents.length > 0) {
            console.log(`Found ${offerEvents.length} Monday offer events via Events API`);
            console.log('This confirms offers were made Monday even if people moved quickly to next stage');
        }
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

checkMondayEvents().catch(console.error);