#!/usr/bin/env node

// Complete pipeline test for backend_3 and backend_4
// Usage: node test-full-pipeline.js

const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';

async function checkPrerequisites() {
  console.log('🔍 Checking prerequisites...');
  
  // Check Vault secrets
  const vaultResponse = await fetch(`${SUPABASE_URL}/functions/v1/vault_test`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'test_encryption'
    })
  });

  const vaultResult = await vaultResponse.json();
  console.log('Vault Status:', vaultResult);

  const hasAnthropicKey = vaultResult.testResults?.anthropicKey?.found;
  const hasGithubToken = vaultResult.testResults?.githubToken?.found;

  if (!hasAnthropicKey || !hasGithubToken) {
    console.error('❌ Missing required API keys in Vault');
    console.error('   Please run: node register-keys.js');
    return false;
  }

  console.log('✅ All prerequisites met');
  return true;
}

async function testClaudeCodePipeline() {
  console.log('\n🧪 Testing Complete ClaudeCode Pipeline...');
  
  // Step 1: Enqueue a job with real repository
  console.log('📨 Step 1: Enqueuing analysis job...');
  const enqueueResponse = await fetch(`${SUPABASE_URL}/functions/v1/enqueue`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      repositories: ['microsoft/vscode'], // Use a well-known public repository
      userId: TEST_USER_ID,
      evaluationCriteria: {
        themeRelevance: 0.1,
        innovation: 0.2,
        technicalQuality: 0.2,
        functionality: 0.15,
        ux: 0.15,
        businessValue: 0.1,
        documentation: 0.1
      }
    })
  });

  if (!enqueueResponse.ok) {
    console.error('❌ Failed to enqueue job');
    return null;
  }

  const enqueueResult = await enqueueResponse.json();
  console.log('✅ Job enqueued:', enqueueResult);
  
  return enqueueResult.jobId;
}

async function triggerWorkerAndWait(jobId) {
  console.log('\n⚙️  Step 2: Triggering worker...');
  
  const workerResponse = await fetch(`${SUPABASE_URL}/functions/v1/repo_worker`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  if (!workerResponse.ok) {
    console.error('❌ Failed to trigger worker');
    return null;
  }

  const workerResult = await workerResponse.json();
  console.log('⚙️  Worker response:', workerResult);

  // Monitor job status
  console.log('\n📊 Step 3: Monitoring job progress...');
  
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes max
  
  while (attempts < maxAttempts) {
    const statusResponse = await fetch(`${SUPABASE_URL}/rest/v1/job_status?id=eq.${jobId}`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY
      }
    });

    const statusData = await statusResponse.json();
    const job = statusData[0];

    if (job) {
      console.log(`📈 Attempt ${attempts + 1}: Status = ${job.status}`);
      
      if (job.status === 'completed') {
        console.log('✅ Job completed successfully!');
        return job;
      } else if (job.status === 'failed') {
        console.error('❌ Job failed:', job.error);
        return job;
      }
    }

    attempts++;
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
  }

  console.error('⏰ Job timed out');
  return null;
}

async function checkEvaluationResults(jobId) {
  console.log('\n📋 Step 4: Checking evaluation results...');
  
  // Get evaluation results
  const resultsResponse = await fetch(`${SUPABASE_URL}/rest/v1/evaluation_results?job_id=eq.${jobId}`, {
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY
    }
  });

  if (!resultsResponse.ok) {
    console.error('❌ Failed to fetch evaluation results');
    return false;
  }

  const results = await resultsResponse.json();
  
  if (results.length === 0) {
    console.error('❌ No evaluation results found');
    return false;
  }

  console.log(`✅ Found ${results.length} evaluation result(s)`);
  
  for (const result of results) {
    console.log(`📊 Repository: ${result.repository_name}`);
    console.log(`🏆 Total Score: ${result.total_score}/100`);
    console.log(`📝 Overall Comment: ${(result.evaluation_data.overallComment || '').substring(0, 100)}...`);
    
    // Check individual items
    if (result.evaluation_data.items && Array.isArray(result.evaluation_data.items)) {
      console.log(`📋 Evaluation Items: ${result.evaluation_data.items.length}/7`);
      result.evaluation_data.items.forEach((item, index) => {
        console.log(`   ${index + 1}. ${item.name}: ${item.score} points`);
      });
    }
  }

  return true;
}

async function testEvaluationQuery() {
  console.log('\n🔍 Step 5: Testing evaluation query functions...');
  
  // Test summary function
  const summaryResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_evaluation_summary`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_user_id: TEST_USER_ID
    })
  });

  if (summaryResponse.ok) {
    const summaries = await summaryResponse.json();
    console.log(`✅ Evaluation summaries: ${summaries.length} found`);
    
    if (summaries.length > 0) {
      const latest = summaries[0];
      console.log(`📊 Latest: ${latest.repository_name} (${latest.total_score}/100)`);
    }
  } else {
    console.error('❌ Failed to fetch evaluation summaries');
  }
}

async function runFullPipelineTest() {
  console.log('🚀 HackScoreAI Full Pipeline Test');
  console.log('=' .repeat(50));
  console.log('This test will:');
  console.log('1. Check prerequisites (Vault keys)');
  console.log('2. Enqueue a real repository analysis job');
  console.log('3. Trigger ClaudeCode processing');
  console.log('4. Monitor job completion');
  console.log('5. Verify evaluation results in database');
  console.log('');

  try {
    // Check prerequisites
    if (!(await checkPrerequisites())) {
      return;
    }

    // Test the pipeline
    const jobId = await testClaudeCodePipeline();
    if (!jobId) {
      console.error('❌ Failed to start pipeline');
      return;
    }

    // Wait for completion
    const completedJob = await triggerWorkerAndWait(jobId);
    if (!completedJob) {
      console.error('❌ Pipeline failed or timed out');
      return;
    }

    // Check results
    if (await checkEvaluationResults(jobId)) {
      await testEvaluationQuery();
      
      console.log('\n🎉 Full pipeline test completed successfully!');
      console.log('');
      console.log('✅ Summary:');
      console.log('   - Vault integration working');
      console.log('   - ClaudeCode execution successful');
      console.log('   - JSON evaluation results detected');
      console.log('   - Results saved to database');
      console.log('   - Query functions operational');
      console.log('');
      console.log('🏆 backend_3 and backend_4 implementation complete!');
    } else {
      console.error('❌ Evaluation results verification failed');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Add warning about API costs
console.log('⚠️  WARNING: This test will make actual API calls to:');
console.log('   - Anthropic Claude API (will incur costs)');
console.log('   - GitHub API (may count against rate limits)');
console.log('');

const args = process.argv.slice(2);
if (args.includes('--confirm')) {
  runFullPipelineTest().catch(console.error);
} else {
  console.log('To proceed with the test, run:');
  console.log('node test-full-pipeline.js --confirm');
}