// Simple diagnostic to find webhook-to-database breakdown
const { Client } = require('pg');
require('dotenv').config();

async function runDiagnostics() {
    console.log('🔬 SIMPLE WEBHOOK DIAGNOSTIC');
    console.log('=' .repeat(40));
    console.log('Testing each component systematically\n');

    const railwayUrl = 'https://fub-stage-tracker-production.up.railway.app';
    
    // Test 1: Database Connection
    console.log('1️⃣ DATABASE CONNECTION TEST');
    console.log('-'.repeat(30));
    try {
        const client = new Client({
            connectionString: process.env.SUPABASE_DB_URL,
            ssl: { rejectUnauthorized: false }
        });
        
        await client.connect();
        const result = await client.query('SELECT COUNT(*) as count FROM stage_changes');
        const count = result.rows[0].count;
        
        console.log(`✅ Database connection: SUCCESS`);
        console.log(`📊 Current records: ${count}`);
        await client.end();
    } catch (error) {
        console.log(`❌ Database connection: FAILED`);
        console.log(`   Error: ${error.message}`);
    }
    console.log('');

    // Test 2: Railway Server Health
    console.log('2️⃣ RAILWAY SERVER HEALTH TEST');
    console.log('-'.repeat(35));
    try {
        const response = await fetch(`${railwayUrl}/health`);
        const data = await response.json();
        
        console.log(`✅ Railway server: RESPONDING`);
        console.log(`📊 Webhooks processed: ${data.webhooks_processed}`);
        console.log(`📊 Stage changes captured: ${data.stage_changes_captured}`);
        console.log(`⚠️ The gap: ${data.webhooks_processed - data.stage_changes_captured} webhooks not captured`);
    } catch (error) {
        console.log(`❌ Railway server: FAILED`);
        console.log(`   Error: ${error.message}`);
    }
    console.log('');

    // Test 3: Check for Todd Brumm
    console.log('3️⃣ TODD BRUMM DATABASE CHECK');
    console.log('-'.repeat(32));
    try {
        const client = new Client({
            connectionString: process.env.SUPABASE_DB_URL,
            ssl: { rejectUnauthorized: false }
        });
        
        await client.connect();
        
        const toddQuery = `
            SELECT 
                first_name, last_name, stage_to, changed_at, source
            FROM stage_changes 
            WHERE (LOWER(first_name) LIKE '%todd%' AND LOWER(last_name) LIKE '%brumm%')
               OR (LOWER(first_name) LIKE '%brumm%' AND LOWER(last_name) LIKE '%todd%')
            ORDER BY changed_at DESC
            LIMIT 5
        `;
        
        const toddResult = await client.query(toddQuery);
        
        if (toddResult.rows.length > 0) {
            console.log(`✅ Todd Brumm found: ${toddResult.rows.length} records`);
            toddResult.rows.forEach((row, i) => {
                const timeAgo = Math.round((Date.now() - new Date(row.changed_at).getTime()) / (1000 * 60));
                console.log(`   ${i + 1}. ${row.first_name} ${row.last_name} → ${row.stage_to}`);
                console.log(`      ${timeAgo} min ago, source: ${row.source}`);
            });
        } else {
            console.log(`❌ Todd Brumm NOT FOUND in database`);
            console.log(`   This means webhooks aren't creating database records`);
        }
        
        await client.end();
    } catch (error) {
        console.log(`❌ Todd Brumm check: FAILED`);
        console.log(`   Error: ${error.message}`);
    }
    console.log('');

    // Test 4: Database Write Test
    console.log('4️⃣ DATABASE WRITE TEST');
    console.log('-'.repeat(25));
    try {
        const client = new Client({
            connectionString: process.env.SUPABASE_DB_URL,
            ssl: { rejectUnauthorized: false }
        });
        
        await client.connect();
        
        const testId = `test_${Date.now()}`;
        const insertQuery = `
            INSERT INTO stage_changes (
                person_id, first_name, last_name, stage_from, stage_to,
                changed_at, received_at, source, event_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id
        `;
        
        const result = await client.query(insertQuery, [
            testId, 'Test', 'User', 'From Stage', 'To Stage',
            new Date().toISOString(), new Date().toISOString(),
            'test', testId
        ]);
        
        const insertedId = result.rows[0].id;
        console.log(`✅ Database write: SUCCESS (ID: ${insertedId})`);
        
        // Clean up
        await client.query('DELETE FROM stage_changes WHERE id = $1', [insertedId]);
        console.log(`🧹 Cleanup: SUCCESS`);
        
        await client.end();
    } catch (error) {
        console.log(`❌ Database write: FAILED`);
        console.log(`   Error: ${error.message}`);
    }
    console.log('');

    // Test 5: Recent Webhook Activity
    console.log('5️⃣ RECENT WEBHOOK ACTIVITY');
    console.log('-'.repeat(30));
    try {
        const response = await fetch(`${railwayUrl}/health`);
        const data = await response.json();
        
        console.log(`📊 Total webhooks received: ${data.webhooks_received}`);
        console.log(`📊 Total webhooks processed: ${data.webhooks_processed}`);
        console.log(`📊 Stage changes captured: ${data.stage_changes_captured}`);
        console.log(`📊 Webhooks ignored: ${data.webhooks_ignored}`);
        console.log(`⏰ Last webhook: ${data.last_webhook_time}`);
        
        if (data.webhooks_processed > 0 && data.stage_changes_captured === 0) {
            console.log('');
            console.log('🚨 DIAGNOSIS: Webhooks processing but not saving to database');
            console.log('   Possible causes:');
            console.log('   • Stage change detection logic too strict');
            console.log('   • Database transaction failures');
            console.log('   • FUB API issues preventing person data fetch');
            console.log('   • Signature verification issues');
        }
    } catch (error) {
        console.log(`❌ Webhook activity check: FAILED`);
        console.log(`   Error: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(40));
    console.log('🎯 NEXT STEPS:');
    console.log('If all tests pass but Todd Brumm not found:');
    console.log('1. Check Railway server logs for error messages');
    console.log('2. Verify FUB webhook signature validation');
    console.log('3. Test with a webhook that has valid signature');
    console.log('4. Check if Railway can reach FUB API');
    console.log('=' .repeat(40));
}

runDiagnostics().catch(console.error);