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
    const { audioBase64, mimeType = 'audio/mp3' } = await req.json()
    if (!audioBase64) {
      throw new Error('audioBase64 is required')
    }

    const hfUrl = Deno.env.get('HF_SPACE_API_URL')
    if (!hfUrl) throw new Error('HF_SPACE_API_URL is not set')
    const hfToken = Deno.env.get('HF_TOKEN')

    // Build HF Inference API request to the Space
    // Many Spaces accept input as multipart/form-data with a file field
    const audioBytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))
    const blob = new Blob([audioBytes], { type: mimeType })
    const formData = new FormData()
    formData.append('file', blob, 'audio.mp3')

    const headers: Record<string, string> = {}
    if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`

    const hfResponse = await fetch(hfUrl, {
      method: 'POST',
      headers,
      body: formData,
    })

    if (!hfResponse.ok) {
      const err = await hfResponse.text()
      console.error('HF Space error:', err)
      throw new Error(`HF Space error: ${err}`)
    }

    // Try JSON first, otherwise text
    let text = ''
    const contentType = hfResponse.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const json = await hfResponse.json()
      text = json.text || json.transcription || JSON.stringify(json)
    } else {
      text = await hfResponse.text()
    }

    return new Response(
      JSON.stringify({ text }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('transcribe-hf error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})


