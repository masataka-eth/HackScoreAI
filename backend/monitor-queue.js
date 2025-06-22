#!/usr/bin/env node

// Queue monitoring script
// Usage: node monitor-queue.js

const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

async function checkQueueMetrics() {
  console.log('📊 Queue Metrics:');
  
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pgmq_metrics`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ queue_name: 'repo_analysis_queue' })
  });

  if (response.ok) {
    const metrics = await response.json();
    console.table(metrics);
  } else {
    console.log('❌ Failed to get metrics');
  }
}

async function checkJobStatus() {
  console.log('\n📋 Recent Job Status:');
  
  const response = await fetch(`${SUPABASE_URL}/rest/v1/job_status?order=created_at.desc&limit=10`, {
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY
    }
  });

  if (response.ok) {
    const jobs = await response.json();
    console.table(jobs.map(job => ({
      id: job.id.slice(0, 8) + '...',
      status: job.status,
      repos: job.payload?.repositories?.length || 0,
      score: job.result?.totalScore || null,
      created: new Date(job.created_at).toLocaleTimeString(),
      updated: new Date(job.updated_at).toLocaleTimeString()
    })));
  } else {
    console.log('❌ Failed to get job status');
  }
}

async function checkActiveQueue() {
  console.log('\n🔄 Active Queue Messages:');
  
  // Direct SQL query to check queue
  const query = `
    SELECT 
      msg_id,
      read_ct,
      enqueued_at,
      message->>'requestId' as request_id
    FROM pgmq.q_repo_analysis_queue 
    ORDER BY enqueued_at DESC 
    LIMIT 5
  `;
  
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sql`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });

  if (response.ok) {
    const result = await response.json();
    if (result.length > 0) {
      console.table(result);
    } else {
      console.log('✅ No messages in queue');
    }
  } else {
    console.log('❌ Failed to check queue');
  }
}

async function checkWorkerStatus() {
  console.log('\n⚙️  Worker Status:');
  
  const response = await fetch(`${SUPABASE_URL}/functions/v1/repo_worker`, {
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    }
  });

  if (response.ok) {
    const status = await response.json();
    console.log(`Status: ${status.status}`);
    console.log(`Processing: ${status.isProcessing ? 'Yes' : 'No'}`);
    console.log(`Last Process: ${status.lastProcessTime}`);
  } else {
    console.log('❌ Worker not responding');
  }
}

async function monitor() {
  console.clear();
  console.log('🔍 HackScoreAI Queue Monitor\n');
  console.log('='.repeat(50));
  
  await checkWorkerStatus();
  await checkQueueMetrics();
  await checkActiveQueue();
  await checkJobStatus();
  
  console.log('\n='.repeat(50));
  console.log('Press Ctrl+C to stop monitoring');
}

// Run monitor every 5 seconds
async function startMonitoring() {
  await monitor();
  setInterval(monitor, 5000);
}

if (process.argv.includes('--once')) {
  monitor();
} else {
  startMonitoring();
}