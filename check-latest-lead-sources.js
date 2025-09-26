#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || 'https://xypbhbdqmxkgflhlxoqz.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5cGJoYmRxbXhrZ2ZsaGx4b3F6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjQ3MTg4MDQsImV4cCI6MjA0MDI5NDgwNH0.g87JMRwtJj_lq1-6WYWCcR0qU0Vks-zTqHkkr2vQWlA';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLatestLeadSources() {
    console.log('🔍 Checking latest stage changes for lead source data...\n');

    try {
        // Get the 10 most recent stage changes
        const { data, error } = await supabase
            .from('stage_changes')
            .select('first_name, last_name, stage_from, stage_to, lead_source_tag, source, changed_at')
            .order('changed_at', { ascending: false })
            .limit(10);

        if (error) {
            console.error('❌ Error fetching data:', error);
            return;
        }

        console.log(`📊 Found ${data.length} recent stage changes:\n`);

        let webhookRecords = 0;
        let leadSourcesFound = 0;

        data.forEach((record, index) => {
            const name = `${record.first_name} ${record.last_name}`;
            const transition = `${record.stage_from || 'NEW'} → ${record.stage_to}`;
            const leadSource = record.lead_source_tag || 'Unknown';
            const source = record.source || 'unknown';
            const time = new Date(record.changed_at).toLocaleString();

            if (source.startsWith('wh_')) {
                webhookRecords++;
                if (record.lead_source_tag) {
                    leadSourcesFound++;
                }
            }

            const sourceIndicator = record.lead_source_tag ? '✅' : '⚠️ ';

            console.log(`${index + 1}. ${sourceIndicator} ${name}`);
            console.log(`   Transition: ${transition}`);
            console.log(`   Lead Source: ${leadSource}`);
            console.log(`   Source: ${source}`);
            console.log(`   Time: ${time}`);
            console.log();
        });

        console.log('📈 Summary:');
        console.log(`   Webhook records in last 10: ${webhookRecords}`);
        console.log(`   Lead sources found: ${leadSourcesFound}/${webhookRecords} webhook records`);

        if (webhookRecords > 0) {
            const successRate = (leadSourcesFound / webhookRecords * 100).toFixed(1);
            console.log(`   Lead source extraction rate: ${successRate}%`);

            if (leadSourcesFound > 0) {
                console.log('✅ Enhanced webhook server is working - lead sources are being extracted!');
            } else {
                console.log('⚠️  Lead sources not being extracted - may still be using old webhook server');
            }
        } else {
            console.log('ℹ️  No recent webhook records found in last 10 changes');
        }

    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

checkLatestLeadSources();