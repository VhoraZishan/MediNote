import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Process base64 in chunks to prevent memory issues
function processBase64Chunks(base64String: string, chunkSize = 32768) {
  const chunks: Uint8Array[] = [];
  let position = 0;
  
  while (position < base64String.length) {
    const chunk = base64String.slice(position, position + chunkSize);
    const binaryChunk = atob(chunk);
    const bytes = new Uint8Array(binaryChunk.length);
    
    for (let i = 0; i < binaryChunk.length; i++) {
      bytes[i] = binaryChunk.charCodeAt(i);
    }
    
    chunks.push(bytes);
    position += chunkSize;
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { audio } = await req.json()
    
    if (!audio) {
      throw new Error('No audio data provided')
    }

    console.log('Starting audio transcription...');

    // Process audio in chunks
    const binaryAudio = processBase64Chunks(audio)
    
    // Prepare form data
    const formData = new FormData()
    const blob = new Blob([binaryAudio], { type: 'audio/webm' })
    formData.append('file', blob, 'audio.webm')
    // Use AssemblyAI for transcription to preserve full speech content.
    const assemblyApiKey = Deno.env.get('ASSEMBLYAI_API_KEY')
    if (!assemblyApiKey) throw new Error('ASSEMBLYAI_API_KEY is not set')

    // Upload audio to AssemblyAI
    const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: {
        'Authorization': assemblyApiKey,
        'Content-Type': 'application/octet-stream',
      },
      body: binaryAudio,
    })

    if (!uploadResponse.ok) {
      const err = await uploadResponse.text()
      console.error('AssemblyAI upload error:', err)
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
      body: JSON.stringify({ audio_url: upload_url, language_code: 'en_us', punctuate: true, format_text: true }),
    })

    if (!transcribeResponse.ok) {
      const err = await transcribeResponse.text()
      console.error('AssemblyAI transcription error:', err)
      throw new Error(`AssemblyAI transcription error: ${err}`)
    }

    const { id } = await transcribeResponse.json()

    // Poll for completion
    let attempts = 0
    const maxAttempts = 60
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      const statusResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, { headers: { 'Authorization': assemblyApiKey } })
      if (!statusResponse.ok) {
        const text = await statusResponse.text()
        console.error('Failed to check status:', text)
        throw new Error('Failed to check transcription status')
      }

      const statusData = await statusResponse.json()
      if (statusData.status === 'completed') {
        return new Response(JSON.stringify({ text: statusData.text }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      } else if (statusData.status === 'error') {
        throw new Error(`Transcription failed: ${statusData.error}`)
      }

      attempts++
    }

    throw new Error('Transcription timeout')

  } catch (error) {
    console.error('Transcription error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})