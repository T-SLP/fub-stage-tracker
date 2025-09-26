// Debug script to investigate "offers made" data issues
// Run with: node debug-offers-made.js

const { Client } = require('pg');
require('dotenv').config();

async function debugOffersMade() {
    console.log('🔍 DEBUG: Investigating "Offers Made" data issues\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        console.log('✅ Database connection established\n');

        // 1. Check all unique stage names in the database
        console.log('1️⃣ CHECKING ALL UNIQUE STAGE NAMES:');
        console.log('=' .repeat(50));
        
        const uniqueStagesQuery = `
            SELECT DISTINCT stage_to, COUNT(*) as count 
            FROM stage_changes 
            WHERE stage_to IS NOT NULL 
            GROUP BY stage_to 
            ORDER BY count DESC, stage_to;
        `;
        
        const uniqueStages = await client.query(uniqueStagesQuery);
        uniqueStages.rows.forEach((row, index) => {
            const marker = row.stage_to.toLowerCase().includes('offer') ? '🎯' : '  ';
            console.log(`${marker} ${index + 1}. "${row.stage_to}" (${row.count} records)`);
        });

        // 2. Check for any stage name containing "offer"
        console.log('\n2️⃣ CHECKING STAGES CONTAINING "OFFER":');
        console.log('=' .repeat(50));
        
        const offerStagesQuery = `
            SELECT stage_to, stage_from, COUNT(*) as count 
            FROM stage_changes 
            WHERE LOWER(stage_to) LIKE '%offer%' 
            GROUP BY stage_to, stage_from 
            ORDER BY count DESC;
        `;
        
        const offerStages = await client.query(offerStagesQuery);
        if (offerStages.rows.length === 0) {
            console.log('❌ NO STAGES FOUND containing "offer"');
        } else {
            offerStages.rows.forEach((row, index) => {
                console.log(`🎯 ${index + 1}. "${row.stage_from}" → "${row.stage_to}" (${row.count} times)`);
            });
        }

        // 3. Check the last 30 days of data for ACQ - Offers Made specifically
        console.log('\n3️⃣ CHECKING LAST 30 DAYS FOR "ACQ - Offers Made":');
        console.log('=' .repeat(50));
        
        const thirtyDaysAgoQuery = `
            SELECT 
                first_name,
                last_name,
                stage_from,
                stage_to,
                changed_at,
                campaign_id,
                lead_source_tag
            FROM stage_changes 
            WHERE stage_to = 'ACQ - Offers Made'
              AND changed_at >= NOW() - INTERVAL '30 days'
            ORDER BY changed_at DESC
            LIMIT 10;
        `;
        
        const recentOffers = await client.query(thirtyDaysAgoQuery);
        if (recentOffers.rows.length === 0) {
            console.log('❌ NO "ACQ - Offers Made" records found in last 30 days');
        } else {
            console.log(`✅ Found ${recentOffers.rows.length} "ACQ - Offers Made" records:`);
            recentOffers.rows.forEach((row, index) => {
                console.log(`   ${index + 1}. ${row.first_name} ${row.last_name} - ${row.changed_at.toISOString().split('T')[0]} (from: ${row.stage_from})`);
            });
        }

        // 4. Check for similar stage names (typos/variations)
        console.log('\n4️⃣ CHECKING FOR SIMILAR STAGE NAMES:');
        console.log('=' .repeat(50));
        
        const similarStagesQuery = `
            SELECT stage_to, COUNT(*) as count 
            FROM stage_changes 
            WHERE (
                LOWER(stage_to) LIKE '%acq%offer%' OR
                LOWER(stage_to) LIKE '%offer%made%' OR
                LOWER(stage_to) LIKE '%made%offer%' OR
                stage_to ILIKE 'ACQ - Offer %'
            )
            GROUP BY stage_to 
            ORDER BY count DESC;
        `;
        
        const similarStages = await client.query(similarStagesQuery);
        if (similarStages.rows.length === 0) {
            console.log('❌ NO SIMILAR stage names found');
        } else {
            similarStages.rows.forEach((row, index) => {
                console.log(`🎯 ${index + 1}. "${row.stage_to}" (${row.count} records)`);
            });
        }

        // 5. Check what stages people transition TO from ACQ - Qualified
        console.log('\n5️⃣ CHECKING TRANSITIONS FROM "ACQ - Qualified":');
        console.log('=' .repeat(50));
        
        const fromQualifiedQuery = `
            SELECT stage_to, COUNT(*) as count 
            FROM stage_changes 
            WHERE stage_from = 'ACQ - Qualified' 
              AND changed_at >= NOW() - INTERVAL '30 days'
            GROUP BY stage_to 
            ORDER BY count DESC 
            LIMIT 10;
        `;
        
        const fromQualified = await client.query(fromQualifiedQuery);
        if (fromQualified.rows.length === 0) {
            console.log('❌ NO transitions from "ACQ - Qualified" found in last 30 days');
        } else {
            console.log('✅ Stages people move to FROM "ACQ - Qualified":');
            fromQualified.rows.forEach((row, index) => {
                const marker = row.stage_to.toLowerCase().includes('offer') ? '🎯' : '  ';
                console.log(`${marker} ${index + 1}. "${row.stage_to}" (${row.count} times)`);
            });
        }

        // 6. Test the exact query used by the dashboard
        console.log('\n6️⃣ TESTING DASHBOARD QUERY (last 7 days):');
        console.log('=' .repeat(50));
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        const endDate = new Date();
        
        const dashboardQuery = `
            SELECT 
                id,
                person_id,
                first_name,
                last_name,
                stage_from,
                stage_to,
                changed_at,
                campaign_id,
                lead_source_tag
            FROM stage_changes 
            WHERE changed_at >= $1 
              AND changed_at <= $2
              AND stage_to != 'Contact Upload'
            ORDER BY changed_at DESC;
        `;
        
        const dashboardResult = await client.query(dashboardQuery, [
            startDate.toISOString(),
            endDate.toISOString()
        ]);
        
        console.log(`📊 Dashboard query returned ${dashboardResult.rows.length} total stage changes`);
        
        const offersInDashboard = dashboardResult.rows.filter(row => row.stage_to === 'ACQ - Offers Made');
        console.log(`🎯 Of those, ${offersInDashboard.length} are "ACQ - Offers Made"`);
        
        if (offersInDashboard.length > 0) {
            console.log('✅ Recent "Offers Made" found:');
            offersInDashboard.slice(0, 5).forEach((row, index) => {
                console.log(`   ${index + 1}. ${row.first_name} ${row.last_name} - ${row.changed_at.toISOString().split('T')[0]}`);
            });
        }

        console.log('\n' + '='.repeat(70));
        console.log('🔍 DIAGNOSIS COMPLETE - Check the results above');
        console.log('='.repeat(70));
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
        console.error('Full error:', error);
    } finally {
        await client.end();
        console.log('\n✅ Database connection closed');
    }
}

// Run the debug function
debugOffersMade().catch(console.error);