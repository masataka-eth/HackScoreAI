import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  const url = new URL(req.url)
  return new Response(
    JSON.stringify({ 
      success: true,
      url: req.url,
      pathname: url.pathname,
      method: req.method,
      timestamp: new Date().toISOString() 
    }),
    { 
      headers: { 'Content-Type': 'application/json' },
      status: 200 
    }
  )
})