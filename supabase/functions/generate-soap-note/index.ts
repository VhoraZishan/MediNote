import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { transcript, patientName } = await req.json()
    
    if (!transcript) {
      throw new Error('No transcript provided')
    }

    console.log('Generating basic SOAP note using full transcript (no Gemini)');

    // To preserve every spoken word and all medical terms, we return a basic
    // structured SOAP object where the `subjective` field contains the full
    // transcript. Other fields are left empty for manual review.
    const soapNote = {
      subjective: transcript,
      objective: '',
      assessment: '',
      plan: '',
      extracted_entities: {}
    };

    return new Response(
      JSON.stringify(soapNote),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('SOAP note generation error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})