#!/usr/bin/env node

// Interactive script to register API keys in Vault
// Usage: node register-keys.js

import readline from 'readline';

const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function storeSecret(secretType, secretName, secretValue) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/vault_test`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'store',
      userId: TEST_USER_ID,
      secretType,
      secretName,
      secretValue
    })
  });

  const result = await response.json();
  return { success: response.ok, result };
}

async function listSecrets() {
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
  return { success: response.ok, result };
}

async function main() {
  console.log('🔐 HackScoreAI - Vault Key Registration Tool');
  console.log('=' .repeat(50));
  console.log('');

  try {
    // Check connection
    const healthResponse = await fetch(`${SUPABASE_URL}/functions/v1/vault_test`);
    if (!healthResponse.ok) {
      console.error('❌ Supabase Edge Functions not responding. Please check:');
      console.error('   1. supabase start');
      console.error('   2. supabase functions serve');
      process.exit(1);
    }
    console.log('✅ Connection to Vault established\n');

    // List existing secrets
    console.log('📋 Current secrets in Vault:');
    const { success: listSuccess, result: listResult } = await listSecrets();
    if (listSuccess && listResult.secrets) {
      if (listResult.secrets.length === 0) {
        console.log('   (No secrets stored)');
      } else {
        listResult.secrets.forEach(secret => {
          console.log(`   - ${secret.secret_type}/${secret.secret_name} (created: ${new Date(secret.created_at).toLocaleString()})`);
        });
      }
    }
    console.log('');

    // Register Anthropic API Key
    console.log('🤖 Anthropic API Key Registration');
    console.log('   Get your key from: https://console.anthropic.com/');
    console.log('   Format: sk-ant-api03-...');
    const anthropicKey = await question('   Enter Anthropic API Key: ');
    
    if (anthropicKey.trim()) {
      if (!anthropicKey.startsWith('sk-ant-api03-')) {
        console.log('⚠️  Warning: Key doesn\'t start with expected prefix sk-ant-api03-');
      }
      
      const { success: anthropicSuccess, result: anthropicResult } = await storeSecret('anthropic_key', 'production', anthropicKey.trim());
      if (anthropicSuccess) {
        console.log('✅ Anthropic API Key stored successfully');
      } else {
        console.log('❌ Failed to store Anthropic API Key:', anthropicResult);
      }
    } else {
      console.log('⏭️  Skipping Anthropic API Key');
    }
    console.log('');

    // Register GitHub Token
    console.log('🐙 GitHub Personal Access Token Registration');
    console.log('   Get your token from: https://github.com/settings/tokens');
    console.log('   Required scopes: repo, read:org');
    console.log('   Format: ghp_... or github_pat_...');
    const githubToken = await question('   Enter GitHub Token: ');
    
    if (githubToken.trim()) {
      if (!githubToken.startsWith('ghp_') && !githubToken.startsWith('github_pat_')) {
        console.log('⚠️  Warning: Token doesn\'t start with expected prefix ghp_ or github_pat_');
      }
      
      const { success: githubSuccess, result: githubResult } = await storeSecret('github_token', 'production', githubToken.trim());
      if (githubSuccess) {
        console.log('✅ GitHub Token stored successfully');
      } else {
        console.log('❌ Failed to store GitHub Token:', githubResult);
      }
    } else {
      console.log('⏭️  Skipping GitHub Token');
    }
    console.log('');

    // Final status
    console.log('📋 Final secrets in Vault:');
    const { success: finalListSuccess, result: finalListResult } = await listSecrets();
    if (finalListSuccess && finalListResult.secrets) {
      finalListResult.secrets.forEach(secret => {
        console.log(`   ✅ ${secret.secret_type}/${secret.secret_name} (updated: ${new Date(secret.updated_at).toLocaleString()})`);
      });
    }

    console.log('\n🎉 Registration completed!');
    console.log('\nNext steps:');
    console.log('   1. Run: node test-vault.js');
    console.log('   2. Test ClaudeCode integration');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main().catch(console.error);