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

    const assemblyApiKey = Deno.env.get('ASSEMBLYAI_API_KEY')
    if (!assemblyApiKey) throw new Error('ASSEMBLYAI_API_KEY is not set')

    // Convert base64 to binary
    const audioBytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))
    
    // Upload audio to AssemblyAI
    const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: {
        'Authorization': assemblyApiKey,
        'Content-Type': 'application/octet-stream',
      },
      body: audioBytes,
    })

    if (!uploadResponse.ok) {
      const err = await uploadResponse.text()
      throw new Error(`AssemblyAI upload error: ${err}`)
    }

    const { upload_url } = await uploadResponse.json()

    // Start transcription
    const transcribeResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        'Authorization': assemblyApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: upload_url,
        language_code: 'en_us',
        punctuate: true,
        format_text: true,
      }),
    })

    if (!transcribeResponse.ok) {
      const err = await transcribeResponse.text()
      throw new Error(`AssemblyAI transcription error: ${err}`)
    }

    const { id } = await transcribeResponse.json()

    // Poll for completion
    let attempts = 0
    const maxAttempts = 30 // 30 seconds max

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second
      
      const statusResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
        headers: { 'Authorization': assemblyApiKey },
      })

      if (!statusResponse.ok) {
        throw new Error('Failed to check transcription status')
      }

      const statusData = await statusResponse.json()
      
      if (statusData.status === 'completed') {
        return new Response(
          JSON.stringify({ text: statusData.text }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } else if (statusData.status === 'error') {
        throw new Error(`Transcription failed: ${statusData.error}`)
      }

      attempts++
    }

    throw new Error('Transcription timeout')

  } catch (error) {
    console.error('transcribe-assemblyai error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
