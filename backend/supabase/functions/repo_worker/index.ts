import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Worker state
let isProcessing = false
let lastProcessTime = Date.now()

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Health check
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ 
        status: 'ok', 
        service: 'repo_worker',
        isProcessing,
        lastProcessTime: new Date(lastProcessTime).toISOString(),
        timestamp: new Date().toISOString() 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  }

  // Process queue endpoint - POST
  if (req.method === 'POST') {
    if (isProcessing) {
      return new Response(
        JSON.stringify({ 
          message: 'Worker is already processing', 
          isProcessing: true 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 429 
        }
      )
    }

    isProcessing = true
    lastProcessTime = Date.now()

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      const supabase = createClient(supabaseUrl, supabaseServiceKey)

      // Read message from queue
      const { data: messages, error: readError } = await supabase.rpc('pgmq_read', {
        queue_name: 'repo_analysis_queue',
        visibility_timeout: 300, // 5 minutes visibility timeout
        qty: 1
      })

      if (readError) {
        console.error('Failed to read from queue:', readError)
        isProcessing = false
        return new Response(
          JSON.stringify({ error: 'Failed to read from queue', details: readError }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
          }
        )
      }

      if (!messages || messages.length === 0) {
        isProcessing = false
        return new Response(
          JSON.stringify({ 
            message: 'No messages in queue',
            processed: 0 
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        )
      }

      const message = messages[0]
      console.log('Processing message:', message.msg_id, message.message)

      // Update job status to processing
      await supabase
        .from('job_status')
        .update({ 
          status: 'processing',
          updated_at: new Date().toISOString()
        })
        .eq('queue_message_id', message.msg_id)

      try {
        // Forward job to Cloud Run worker (without secrets) - Fire and forget
        console.log('🚀 Starting Cloud Run processing (async)')
        
        // Start processing in Cloud Run (don't await)
        forwardToCloudRunWorker({
          ...message.message,
          // Don't send secrets over HTTP - Cloud Run will fetch them directly
          requiresSecrets: true
        }).catch(error => {
          console.error('❌ Cloud Run processing failed:', error)
          // Update job status to failed
          supabase
            .from('job_status')
            .update({ 
              status: 'failed',
              error: error.message,
              updated_at: new Date().toISOString()
            })
            .eq('queue_message_id', message.msg_id)
        })
        
        // Immediately return success and delete from queue
        const result = {
          success: true,
          message: 'Job forwarded to Cloud Run worker',
          cloudRunProcessing: true
        }

        // Update job status to completed
        await supabase
          .from('job_status')
          .update({ 
            status: 'completed',
            result: result,
            updated_at: new Date().toISOString()
          })
          .eq('queue_message_id', message.msg_id)

        // Delete message from queue
        await supabase.rpc('pgmq_delete', {
          queue_name: 'repo_analysis_queue',
          msg_id: message.msg_id
        })

        isProcessing = false
        return new Response(
          JSON.stringify({ 
            success: true,
            messageId: message.msg_id,
            result: result
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        )

      } catch (processError) {
        console.error('Processing error:', processError)
        
        // Update job status to failed
        await supabase
          .from('job_status')
          .update({ 
            status: 'failed',
            error: processError instanceof Error ? processError.message : 'Unknown error',
            updated_at: new Date().toISOString()
          })
          .eq('queue_message_id', message.msg_id)

        // Archive failed message
        await supabase.rpc('pgmq_archive', {
          queue_name: 'repo_analysis_queue',
          msg_id: message.msg_id
        })

        isProcessing = false
        return new Response(
          JSON.stringify({ 
            error: 'Processing failed',
            messageId: message.msg_id,
            details: processError instanceof Error ? processError.message : 'Unknown error'
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
          }
        )
      }

    } finally {
      isProcessing = false
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

// Forward job to Cloud Run worker
async function forwardToCloudRunWorker(jobPayload: any) {
  const cloudRunUrl = Deno.env.get('CLOUD_RUN_WORKER_URL') || 'http://host.docker.internal:8080'
  const authToken = Deno.env.get('CLOUD_RUN_AUTH_TOKEN') || ''
  
  console.log('🚀 Forwarding job to Cloud Run worker:', cloudRunUrl)
  console.log('🔑 Auth token available:', authToken ? 'Yes' : 'No')
  console.log('📦 Payload:', JSON.stringify(jobPayload, null, 2))
  
  try {
    const response = await fetch(`${cloudRunUrl}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(jobPayload)
    })
  
    if (!response.ok) {
      throw new Error(`Cloud Run worker failed: ${response.status} ${response.statusText}`)
    }
    
    return await response.json()
  } catch (error) {
    console.error('❌ Fetch error details:', error)
    console.error('❌ Cloud Run URL:', cloudRunUrl)
    console.error('❌ Auth token length:', authToken.length)
    throw error
  }
}

