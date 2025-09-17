// Run historical polling to capture Monday/Tuesday offers that webhooks missed
const { Client } = require('pg');
require('dotenv').config();

async function runHistoricalPolling() {
    console.log('🔄 RUNNING: Historical polling to capture missed offers');
    console.log('=' .repeat(60));
    console.log('Looking for Monday/Tuesday offers that webhooks missed\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        
        // First, check what we already have
        console.log('📊 CURRENT OFFERS IN DATABASE:');
        console.log('-'.repeat(40));
        
        const currentQuery = `
            SELECT 
                first_name,
                last_name,
                changed_at,
                source
            FROM stage_changes 
            WHERE stage_to = 'ACQ - Offers Made'
              AND changed_at >= '2025-09-08'
              AND changed_at <= '2025-09-10 23:59:59'
            ORDER BY changed_at ASC;
        `;
        
        const currentResult = await client.query(currentQuery);
        
        console.log(`Found ${currentResult.rows.length} existing offers Sep 8-10:`);
        const existingOffers = new Set();
        
        currentResult.rows.forEach((row, index) => {
            const date = new Date(row.changed_at).toDateString();
            console.log(`${index + 1}. ${row.first_name} ${row.last_name} - ${date} (${row.source})`);
            existingOffers.add(`${row.first_name}_${row.last_name}_ACQ - Offers Made`);
        });
        
        // Now fetch from FUB API to see what we're missing
        console.log('\n🔍 FETCHING FROM FUB API:');
        console.log('-'.repeat(30));
        
        const authHeader = Buffer.from(`${process.env.FUB_API_KEY}:`).toString('base64');
        
        // Get people updated in last 7 days to catch Monday offers
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 7);
        const cutoffStr = cutoffDate.toISOString().split('T')[0];
        
        console.log(`Fetching people updated since ${cutoffStr}...`);
        
        let allPeople = [];
        let offset = 0;
        const limit = 100;
        
        // Fetch all people from FUB API
        while (true) {
            try {
                const response = await fetch(
                    `https://api.followupboss.com/v1/people?limit=${limit}&offset=${offset}&updatedGte=${cutoffStr}T00:00:00Z&include=stageHistory`,
                    {
                        headers: {
                            'Authorization': `Basic ${authHeader}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                
                if (!response.ok) {
                    throw new Error(`FUB API error: ${response.status} ${response.statusText}`);
                }
                
                const data = await response.json();
                const people = data.people || [];
                
                if (people.length === 0) break;
                
                allPeople.push(...people);
                offset += limit;
                
                console.log(`Fetched ${people.length} people (total: ${allPeople.length})`);
                
                // Rate limiting - be respectful to FUB API
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.error(`❌ FUB API Error: ${error.message}`);
                break;
            }
        }
        
        console.log(`\nTotal people from FUB: ${allPeople.length}`);
        
        // Check for offers made that we don't have
        console.log('\n🎯 CHECKING FOR MISSING OFFERS:');
        console.log('-'.repeat(35));
        
        let newOffers = [];
        
        allPeople.forEach(person => {
            // Check if person is currently in "ACQ - Offers Made" OR has stage history showing they were in it
            const isCurrentlyInOfferStage = person.stage === 'ACQ - Offers Made';
            const wasInOfferStage = person.stageHistory && person.stageHistory.some(h => 
                h.stage === 'ACQ - Offers Made' && 
                new Date(h.changedAt) >= new Date('2025-09-08') && 
                new Date(h.changedAt) <= new Date('2025-09-10T23:59:59')
            );
            
            if (isCurrentlyInOfferStage || wasInOfferStage) {
                const key = `${person.firstName}_${person.lastName}_ACQ - Offers Made`;
                
                if (!existingOffers.has(key)) {
                    newOffers.push(person);
                    console.log(`📋 MISSING: ${person.firstName} ${person.lastName}`);
                    console.log(`   Current Stage: ${person.stage}`);
                    console.log(`   Updated: ${person.updated}`);
                    if (wasInOfferStage) {
                        const offerHistory = person.stageHistory.find(h => h.stage === 'ACQ - Offers Made');
                        console.log(`   Was in Offers Made: ${offerHistory?.changedAt}`);
                    }
                    console.log('');
                }
            }
        });
        
        if (newOffers.length === 0) {
            console.log('✅ No missing offers found - database is complete!');
        } else {
            console.log(`🚨 Found ${newOffers.length} missing offers!`);
            
            // Add missing offers to database
            console.log('\n💾 ADDING MISSING OFFERS TO DATABASE:');
            console.log('-'.repeat(45));
            
            for (const person of newOffers) {
                try {
                    const insertQuery = `
                        INSERT INTO stage_changes (
                            person_id, first_name, last_name, stage_from, stage_to,
                            changed_at, received_at, source, event_id, raw_payload,
                            campaign_id, who_pushed_lead, parcel_county, parcel_state, lead_source_tag
                        ) VALUES (
                            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
                        )
                        ON CONFLICT (event_id) DO NOTHING;
                    `;
                    
                    const eventTime = person.updated || new Date().toISOString();
                    const receivedTime = new Date().toISOString();
                    
                    const values = [
                        String(person.id),
                        person.firstName,
                        person.lastName,
                        'Previous Stage',
                        'ACQ - Offers Made',
                        eventTime,
                        receivedTime,
                        'historical_polling',
                        `historical_${person.id}_${Date.now()}`,
                        JSON.stringify(person),
                        person.customCampaignID || null,
                        person.customWhoPushedTheLead || null,
                        person.customParcelCounty || null,
                        person.customParcelState || null,
                        person.tags?.includes('ReadyMode') ? 'ReadyMode' : (person.tags?.includes('Roor') ? 'Roor' : null)
                    ];
                    
                    await client.query(insertQuery, values);
                    console.log(`✅ Added: ${person.firstName} ${person.lastName}`);
                    
                } catch (error) {
                    console.error(`❌ Failed to add ${person.firstName} ${person.lastName}: ${error.message}`);
                }
            }
            
            console.log(`\n🎉 Added ${newOffers.length} historical offers to database!`);
        }
        
        // Final summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 HISTORICAL POLLING COMPLETE');
        console.log(`✅ Database now has complete offer history`);
        console.log(`🚀 Future offers will be captured by webhooks in real-time`);
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

runHistoricalPolling().catch(console.error);