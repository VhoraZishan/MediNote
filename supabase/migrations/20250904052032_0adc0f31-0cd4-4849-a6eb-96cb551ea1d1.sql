-- Create profiles table for user information
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  medical_license TEXT,
  specialty TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create consultations table
CREATE TABLE public.consultations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  patient_name TEXT NOT NULL,
  patient_id TEXT,
  consultation_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  duration_minutes INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create medical_notes table for SOAP notes
CREATE TABLE public.medical_notes (
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
CREATE TABLE public.audio_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  consultation_id UUID NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
  file_path TEXT,
  duration_seconds INTEGER,
  transcription_status TEXT DEFAULT 'pending' CHECK (transcription_status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_recordings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for profiles
CREATE POLICY "Users can view their own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = user_id);

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

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_consultations_updated_at
BEFORE UPDATE ON public.consultations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_medical_notes_updated_at
BEFORE UPDATE ON public.medical_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for new user registration
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- Create function to automatically delete expired audio recordings
CREATE OR REPLACE FUNCTION public.cleanup_expired_recordings()
RETURNS void AS $$
BEGIN
  DELETE FROM public.audio_recordings 
  WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql SET search_path = public;