-- Create consultations table
CREATE TABLE IF NOT EXISTS public.consultations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_name TEXT NOT NULL,
  patient_id TEXT,
  consultation_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  duration_minutes INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create medical_notes table for SOAP notes
CREATE TABLE IF NOT EXISTS public.medical_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  consultation_id UUID NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
  subjective TEXT, -- Patient complaints, history
  objective TEXT, -- Observed details, vitals, tests
  assessment TEXT, -- Doctor's provisional diagnosis
  plan TEXT, -- Prescription, advice, follow-up
  raw_transcript TEXT,
  extracted_entities JSONB, -- Symptoms, medications, etc.
  is_reviewed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create audio_recordings table (temporary storage)
CREATE TABLE IF NOT EXISTS public.audio_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  consultation_id UUID NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
  file_path TEXT,
  duration_seconds INTEGER,
  transcription_status TEXT DEFAULT 'pending' CHECK (transcription_status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);

-- Enable Row Level Security
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_recordings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for consultations
CREATE POLICY "Doctors can view their own consultations" 
ON public.consultations FOR SELECT 
USING (auth.uid() = doctor_id);

CREATE POLICY "Doctors can create their own consultations" 
ON public.consultations FOR INSERT 
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Doctors can update their own consultations" 
ON public.consultations FOR UPDATE 
USING (auth.uid() = doctor_id);

-- Create RLS policies for medical_notes
CREATE POLICY "Doctors can view notes for their consultations" 
ON public.medical_notes FOR SELECT 
USING (auth.uid() IN (SELECT doctor_id FROM public.consultations WHERE id = consultation_id));

CREATE POLICY "Doctors can create notes for their consultations" 
ON public.medical_notes FOR INSERT 
WITH CHECK (auth.uid() IN (SELECT doctor_id FROM public.consultations WHERE id = consultation_id));

CREATE POLICY "Doctors can update notes for their consultations" 
ON public.medical_notes FOR UPDATE 
USING (auth.uid() IN (SELECT doctor_id FROM public.consultations WHERE id = consultation_id));

-- Create RLS policies for audio_recordings
CREATE POLICY "Doctors can view recordings for their consultations" 
ON public.audio_recordings FOR SELECT 
USING (auth.uid() IN (SELECT doctor_id FROM public.consultations WHERE id = consultation_id));

CREATE POLICY "Doctors can create recordings for their consultations" 
ON public.audio_recordings FOR INSERT 
WITH CHECK (auth.uid() IN (SELECT doctor_id FROM public.consultations WHERE id = consultation_id));