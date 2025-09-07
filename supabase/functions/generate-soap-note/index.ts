import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  let transcript = "";

  try {
    const body = await req.json();
    transcript = body.transcript || "";
    const patientName = body.patientName || "";

    console.log("Transcript received:", transcript);

    if (!transcript.trim()) {
      return new Response(
        JSON.stringify({
          soap: {
            subjective: "No transcript provided",
            objective: "",
            assessment: "",
            plan: "",
          },
          medicalTerms: {},
        }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("Gemini API key not set in environment");

    // ✅ Call Gemini API directly
    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `
Extract structured SOAP medical info from the transcript below. 
IMPORTANT: Do not shorten or reduce the Subjective section. Include the transcript fully in Subjective, but organize other fields properly.
Return valid JSON ONLY with these keys:
- subjective
- objective
- assessment
- plan
- extracted_entities

Transcript: """${transcript}"""
                  `,
                },
              ],
            },
          ],
        }),
      }
    );

    const geminiData = await geminiResp.json();

    if (!geminiResp.ok) {
      console.error("Gemini API error:", geminiData);
      throw new Error(`Gemini API returned error: ${JSON.stringify(geminiData)}`);
    }

    // ✅ Extract model’s reply
    const rawOutput =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "{}";

    let parsed;
    try {
      parsed = JSON.parse(rawOutput);
    } catch (err) {
      console.warn("Gemini output not JSON, wrapping as subjective", rawOutput);
      parsed = {
        subjective: transcript, // ensure full transcript is always preserved
        objective: "",
        assessment: "",
        plan: "",
        extracted_entities: {},
      };
    }

    // ✅ Always preserve full transcript in Subjective
    const soapNote = {
      subjective: parsed.subjective && parsed.subjective.trim().length > 0 ? parsed.subjective : transcript,
      objective: parsed.objective || "",
      assessment: parsed.assessment || "",
      plan: parsed.plan || "",
    };

    const medicalTerms = parsed.extracted_entities || {};

    return new Response(
      JSON.stringify({ soap: soapNote, medicalTerms }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("SOAP generation error:", error);
    return new Response(
      JSON.stringify({
        soap: {
          subjective: transcript || "Transcript unavailable",
          objective: "",
          assessment: "",
          plan: "",
        },
        medicalTerms: {},
        error: error.message,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
