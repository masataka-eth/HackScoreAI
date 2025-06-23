import { serve } from "https://deno.land/std@0.184.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user from JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const { repositoryName, evaluationId } = await req.json();

    if (!repositoryName) {
      return new Response(
        JSON.stringify({ error: "Repository name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📝 Creating retry job for ${repositoryName} by user ${user.id}`);

    // Create retry job using the database function
    const { data: jobId, error: retryError } = await supabase.rpc("create_retry_job", {
      p_repository_name: repositoryName,
      p_user_id: user.id,
      p_evaluation_id: evaluationId || null,
    });

    if (retryError) {
      console.error("Failed to create retry job:", retryError);
      return new Response(
        JSON.stringify({ error: "Failed to create retry job", details: retryError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ Retry job created with ID: ${jobId}`);

    // Trigger Cloud Run worker ping
    const cloudRunUrl = Deno.env.get("CLOUD_RUN_WORKER_URL");
    if (cloudRunUrl) {
      try {
        const pingResponse = await fetch(`${cloudRunUrl}/poll`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${Deno.env.get("CLOUD_RUN_AUTH_TOKEN")}`,
            "Content-Type": "application/json",
          },
        });

        if (!pingResponse.ok) {
          console.error(`Worker ping failed: ${pingResponse.status}`);
        } else {
          console.log("✅ Worker pinged successfully");
        }
      } catch (pingError) {
        console.error("Failed to ping worker:", pingError);
        // Don't fail the request if ping fails
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        jobId,
        repositoryName,
        message: "Re-analysis job created successfully",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});