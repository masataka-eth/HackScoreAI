#!/usr/bin/env node

// Vault functionality test script
// Usage: node test-vault.js

const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';

async function testVaultHealthCheck() {
  console.log('🔐 Testing Vault Health Check...');
  
  const response = await fetch(`${SUPABASE_URL}/functions/v1/vault_test`, {
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    }
  });

  const result = await response.json();
  console.log('Health Check:', result);
  return response.ok;
}

async function testEncryption() {
  console.log('\n🔒 Testing Encryption/Decryption...');
  
  const response = await fetch(`${SUPABASE_URL}/functions/v1/vault_test`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'test_encryption'
    })
  });

  const result = await response.json();
  console.log('Encryption Test:', result);
  return response.ok;
}

async function testStoreSecret() {
  console.log('\n💾 Testing Store Secret...');
  
  const response = await fetch(`${SUPABASE_URL}/functions/v1/vault_test`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'store',
      userId: TEST_USER_ID,
      secretType: 'test_key',
      secretName: 'demo',
      secretValue: 'test-secret-value-123'
    })
  });

  const result = await response.json();
  console.log('Store Secret:', result);
  return response.ok;
}

async function testGetSecret() {
  console.log('\n🔍 Testing Get Secret...');
  
  const response = await fetch(`${SUPABASE_URL}/functions/v1/vault_test`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'get',
      userId: TEST_USER_ID,
      secretType: 'test_key'
    })
  });

  const result = await response.json();
  console.log('Get Secret:', result);
  return response.ok;
}

async function testListSecrets() {
  console.log('\n📋 Testing List Secrets...');
  
  const response = await fetch(`${SUPABASE_URL}/functions/v1/vault_test`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'list',
      userId: TEST_USER_ID
    })
  });

  const result = await response.json();
  console.log('List Secrets:', result);
  return response.ok;
}

async function testWorkerWithVault() {
  console.log('\n⚙️  Testing Worker with Vault Integration...');
  
  // First enqueue a job
  const enqueueResponse = await fetch(`${SUPABASE_URL}/functions/v1/enqueue`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      repositories: ['test/vault-repo'],
      userId: TEST_USER_ID,
      evaluationCriteria: {
        codeQuality: 0.5,
        documentation: 0.5
      }
    })
  });

  const enqueueResult = await enqueueResponse.json();
  console.log('Enqueue Job:', enqueueResult);

  if (!enqueueResponse.ok) {
    return false;
  }

  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Trigger worker
  const workerResponse = await fetch(`${SUPABASE_URL}/functions/v1/repo_worker`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  const workerResult = await workerResponse.json();
  console.log('Worker with Vault:', workerResult);

  return workerResponse.ok;
}

async function runVaultTests() {
  console.log('🧪 Starting Vault Functionality Tests\n');
  console.log('='.repeat(50));
  
  const tests = [
    { name: 'Health Check', test: testVaultHealthCheck },
    { name: 'Encryption Test', test: testEncryption },
    { name: 'Store Secret', test: testStoreSecret },
    { name: 'Get Secret', test: testGetSecret },
    { name: 'List Secrets', test: testListSecrets },
    { name: 'Worker with Vault', test: testWorkerWithVault }
  ];

  let passed = 0;
  let failed = 0;

  for (const { name, test } of tests) {
    try {
      const success = await test();
      if (success) {
        console.log(`✅ ${name} - PASSED`);
        passed++;
      } else {
        console.log(`❌ ${name} - FAILED`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${name} - ERROR:`, error.message);
      failed++;
    }
    
    console.log('-'.repeat(30));
  }

  console.log('\n📊 Test Results:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 All Vault tests passed! Edge Worker can successfully retrieve keys from Vault.');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the implementation.');
  }
}

// Run the tests
runVaultTests().catch(console.error);