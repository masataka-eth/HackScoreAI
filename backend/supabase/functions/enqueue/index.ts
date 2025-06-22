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

  // Health check
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ 
        status: 'ok', 
        service: 'enqueue',
        timestamp: new Date().toISOString() 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  }

  // Enqueue endpoint - POST
  if (req.method === 'POST') {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      const supabase = createClient(supabaseUrl, supabaseServiceKey)

      const body = await req.json()
      
      // Validate input
      if (!body.repositories || !Array.isArray(body.repositories)) {
        return new Response(
          JSON.stringify({ error: 'repositories array is required' }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400 
          }
        )
      }

      // Prepare job payload
      const jobPayload = {
        repositories: body.repositories,
        evaluationCriteria: body.evaluationCriteria || {},
        timestamp: new Date().toISOString(),
        requestId: crypto.randomUUID()
      }

      // Send message to pgmq queue
      const { data: queueResult, error: queueError } = await supabase.rpc('pgmq_send', {
        queue_name: 'repo_analysis_queue',
        message: jobPayload
      })

      if (queueError) {
        console.error('Queue error:', queueError)
        return new Response(
          JSON.stringify({ error: 'Failed to enqueue job', details: queueError.message }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
          }
        )
      }

      // Create job status record
      const { data: jobStatus, error: jobError } = await supabase
        .from('job_status')
        .insert({
          queue_message_id: queueResult,
          status: 'queued',
          payload: jobPayload
        })
        .select()
        .single()

      if (jobError) {
        console.error('Job status error:', jobError)
        return new Response(
          JSON.stringify({ error: 'Failed to create job status', details: jobError.message }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
          }
        )
      }

      // Return success response
      return new Response(
        JSON.stringify({
          success: true,
          jobId: jobStatus.id,
          queueMessageId: queueResult,
          requestId: jobPayload.requestId,
          message: 'Job successfully enqueued'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )

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