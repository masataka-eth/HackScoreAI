import { serve } from "https://deno.land/std@0.184.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req: Request) => {
  console.log("📨 Enqueue function called", {
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers.entries()),
  });

  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    console.log("🔧 Supabase URL:", supabaseUrl);

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Get auth header
    const authHeader = req.headers.get("Authorization");
    console.log("🔐 Auth header:", authHeader?.substring(0, 50) + "...");

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse request body first
    const { repositories, evaluationCriteria, userId } = await req.json();

    if (
      !repositories ||
      !Array.isArray(repositories) ||
      repositories.length === 0
    ) {
      return new Response(
        JSON.stringify({ error: "Repositories array is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Extract token
    const token = authHeader.replace("Bearer ", "");

    // Create a client with the user's token for authentication
    const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify user
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    console.log("👤 Auth result:", {
      user: user ? { id: user.id, email: user.email } : null,
      error: authError,
    });

    if (authError || !user) {
      console.error("❌ Auth failed:", authError);
      // Fallback to userId from body if provided
      if (userId) {
        console.log("⚠️ Using userId from request body as fallback:", userId);
      } else {
        return new Response(
          JSON.stringify({
            error: "Invalid token",
            details: authError?.message,
          }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    const actualUserId = user?.id || userId;
    console.log("✅ Using userId:", actualUserId);

    const hackathonName =
      evaluationCriteria?.hackathonName ||
      `ハッカソン ${new Date().toLocaleDateString("ja-JP")}`;

    console.log(
      `📝 Creating hackathon "${hackathonName}" for user ${actualUserId} with ${repositories.length} repositories`
    );

    // Create hackathon using database function with admin client
    const { data: hackathonId, error: createError } = await supabaseAdmin.rpc(
      "create_hackathon",
      {
        p_name: hackathonName,
        p_user_id: actualUserId,
        p_repositories: repositories,
        p_metadata: {
          evaluationCriteria: evaluationCriteria || {},
        },
      }
    );

    if (createError) {
      console.error("Failed to create hackathon:", createError);
      return new Response(
        JSON.stringify({
          error: "Failed to create hackathon",
          details: createError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`✅ Hackathon created with ID: ${hackathonId}`);

    // Trigger Cloud Run worker ping
    const cloudRunUrl = Deno.env.get("CLOUD_RUN_WORKER_URL");
    if (cloudRunUrl) {
      try {
        const pingResponse = await fetch(`${cloudRunUrl}/poll`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Deno.env.get("CLOUD_RUN_AUTH_TOKEN")}`,
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
        hackathonId,
        message: `Hackathon created with ${repositories.length} repositories`,
        repositories,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
