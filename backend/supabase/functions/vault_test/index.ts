// Deno型定義の宣言
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Health check
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ 
        status: 'ok', 
        service: 'vault_test',
        timestamp: new Date().toISOString() 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  }

  // Vault operations
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      const { action, userId, secretType, secretName, secretValue } = body

      switch (action) {
        case 'store':
          // Store a secret
          if (!userId || !secretType || !secretName || !secretValue) {
            return new Response(
              JSON.stringify({ error: 'Missing required parameters: userId, secretType, secretName, secretValue' }),
              { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400 
              }
            )
          }

          const { data: storeResult, error: storeError } = await supabase.rpc('store_user_secret', {
            p_user_id: userId,
            p_secret_type: secretType,
            p_secret_name: secretName,
            p_secret_value: secretValue
          })

          if (storeError) {
            return new Response(
              JSON.stringify({ error: 'Failed to store secret', details: storeError.message }),
              { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500 
              }
            )
          }

          return new Response(
            JSON.stringify({ 
              success: true,
              secretId: storeResult,
              message: 'Secret stored successfully'
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200 
            }
          )

        case 'get':
          // Get a secret
          if (!userId || !secretType) {
            return new Response(
              JSON.stringify({ error: 'Missing required parameters: userId, secretType' }),
              { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400 
              }
            )
          }

          const { data: getResult, error: getError } = await supabase.rpc('get_secret_for_job', {
            p_user_id: userId,
            p_secret_type: secretType
          })

          if (getError) {
            return new Response(
              JSON.stringify({ error: 'Failed to get secret', details: getError.message }),
              { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500 
              }
            )
          }

          return new Response(
            JSON.stringify({ 
              success: true,
              secretValue: getResult,
              found: getResult !== null
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200 
            }
          )

        case 'list':
          // List user's secrets
          if (!userId) {
            return new Response(
              JSON.stringify({ error: 'Missing required parameter: userId' }),
              { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400 
              }
            )
          }

          const { data: listResult, error: listError } = await supabase.rpc('list_user_secrets', {
            p_user_id: userId
          })

          if (listError) {
            return new Response(
              JSON.stringify({ error: 'Failed to list secrets', details: listError.message }),
              { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500 
              }
            )
          }

          return new Response(
            JSON.stringify({ 
              success: true,
              secrets: listResult
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200 
            }
          )

        case 'test_encryption':
          // Test encryption/decryption
          const testUserId = '11111111-1111-1111-1111-111111111111'
          
          // Get both secrets for the test user
          const { data: anthropicKey, error: anthropicError } = await supabase.rpc('get_secret_for_job', {
            p_user_id: testUserId,
            p_secret_type: 'anthropic_key'
          })

          const { data: githubToken, error: githubError } = await supabase.rpc('get_secret_for_job', {
            p_user_id: testUserId,
            p_secret_type: 'github_token'
          })

          return new Response(
            JSON.stringify({ 
              success: true,
              testResults: {
                anthropicKey: {
                  found: !anthropicError && anthropicKey !== null,
                  value: anthropicKey ? anthropicKey.substring(0, 10) + '...' : null,
                  error: anthropicError?.message
                },
                githubToken: {
                  found: !githubError && githubToken !== null,
                  value: githubToken ? githubToken.substring(0, 10) + '...' : null,
                  error: githubError?.message
                }
              },
              message: 'Encryption test completed'
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200 
            }
          )

        default:
          return new Response(
            JSON.stringify({ error: 'Invalid action. Use: store, get, list, or test_encryption' }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 400 
            }
          )
      }

    } catch (error) {
      console.error('Unexpected error:', error)
      return new Response(
        JSON.stringify({ 
          error: 'Internal server error', 
          details: error instanceof Error ? error.message : 'Unknown error' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      )
    }
  }

  return new Response(
    JSON.stringify({ error: 'Method not allowed' }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405 
    }
  )
})