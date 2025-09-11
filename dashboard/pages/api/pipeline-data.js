// pages/api/pipeline-data.js
import { Client } from 'pg';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { startDate, endDate } = req.body;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' });
  }

  const client = new Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();

    // First, get all unique stage names to understand the data structure
    const stageAnalysisQuery = `
      SELECT 
        stage_to,
        stage_from,
        COUNT(*) as count
      FROM stage_changes 
      WHERE changed_at >= $1 
        AND changed_at <= $2
        AND stage_to != 'Contact Upload'
      GROUP BY stage_to, stage_from
      ORDER BY count DESC
    `;

    const stageAnalysis = await client.query(stageAnalysisQuery, [
      `${startDate}T00:00:00Z`,
      `${endDate}T23:59:59Z`
    ]);

    // For Time to Offer calculation, we need a broader date range to capture qualifications
    // Extend the start date by 60 days to capture more qualification events
    const extendedStartDate = new Date(startDate);
    extendedStartDate.setDate(extendedStartDate.getDate() - 60);
    
    const query = `
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
      ORDER BY changed_at DESC
    `;

    const result = await client.query(query, [
      `${extendedStartDate.toISOString().split('T')[0]}T00:00:00Z`,
      `${endDate}T23:59:59Z`
    ]);
    
    console.log(`API DEBUG - Extended date range for Time to Offer: ${extendedStartDate.toISOString().split('T')[0]} to ${endDate}`);

    await client.end();

    // Add debug info for offers made this week
    const offersThisWeek = result.rows.filter(change => 
      change.stage_to === 'ACQ - Offers Made'
    );
    
    console.log(`API DEBUG - Date range: ${startDate} to ${endDate}`);
    console.log(`API DEBUG - Total stage changes: ${result.rows.length}`);
    console.log(`API DEBUG - Offers made in period: ${offersThisWeek.length}`);
    offersThisWeek.forEach(offer => {
      console.log(`  - ${offer.changed_at}: ${offer.first_name} ${offer.last_name}`);
    });

    // Include stage analysis in response for debugging
    res.status(200).json({
      stageChanges: result.rows,
      stageAnalysis: stageAnalysis.rows,
      debug: {
        dateRange: `${startDate} to ${endDate}`,
        totalChanges: result.rows.length,
        offersInPeriod: offersThisWeek.length
      }
    });

  } catch (error) {
    console.error('Database error:', error);
    
    // Make sure to close connection on error
    try {
      await client.end();
    } catch (closeError) {
      console.error('Error closing connection:', closeError);
    }

    res.status(500).json({ 
      error: 'Failed to fetch pipeline data',
      details: error.message 
    });
  }
}