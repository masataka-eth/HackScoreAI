#!/usr/bin/env node

// Test script for queue functionality
// Usage: node test-queue.js

const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

async function testEnqueue() {
  console.log('📨 Testing enqueue endpoint...');
  
  const response = await fetch(`${SUPABASE_URL}/functions/v1/enqueue`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      repositories: [
        'user/repo1',
        'user/repo2',
        'user/repo3'
      ],
      evaluationCriteria: {
        codeQuality: 0.3,
        documentation: 0.2,
        innovation: 0.3,
        complexity: 0.2
      }
    })
  });

  const result = await response.json();
  console.log('Response:', result);
  
  return result.jobId;
}

async function checkJobStatus(jobId) {
  console.log(`\n🔍 Checking job status for: ${jobId}`);
  
  // Using direct database query via REST API
  const response = await fetch(`${SUPABASE_URL}/rest/v1/job_status?id=eq.${jobId}`, {
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY
    }
  });

  const data = await response.json();
  const status = data[0] || { error: 'Job not found' };
  console.log('Job Status:', status);
  
  return status;
}

async function triggerWorker() {
  console.log('\n⚙️  Manually triggering worker...');
  
  const response = await fetch(`${SUPABASE_URL}/functions/v1/repo_worker`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action: 'process' })
  });

  const result = await response.json();
  console.log('Worker Response:', result);
}

async function runTest() {
  try {
    // 1. Enqueue a job
    const jobId = await testEnqueue();
    
    if (!jobId) {
      console.error('Failed to enqueue job');
      return;
    }

    // 2. Check initial status
    await checkJobStatus(jobId);

    // 3. Wait a bit
    console.log('\n⏳ Waiting 2 seconds...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. Trigger worker manually
    await triggerWorker();

    // 5. Wait for processing
    console.log('\n⏳ Waiting 3 seconds for processing...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 6. Check final status
    await checkJobStatus(jobId);

    console.log('\n✅ Test completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
  }
}

// Run the test
runTest();