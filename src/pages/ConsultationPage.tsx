import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import {
  ArrowLeft,
  User,
  Calendar,
  Clock,
  Mic,
  FileText,
  Upload,
  CheckCircle,
} from "lucide-react";
import { AudioRecorder } from "@/components/recording/AudioRecorder";
import { SOAPEditor } from "@/components/notes/SOAPEditor";

interface Consultation {
  id: string;
  patient_name: string;
  patient_id: string;
  consultation_date: string;
  status: "in_progress" | "completed" | "cancelled";
  duration_minutes: number | null;
}

interface MedicalNote {
  id: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  raw_transcript: string;
  extracted_entities: Record<string, unknown>;
  is_reviewed: boolean;
}

type DBError = { code?: string; message?: string } | Error;

export const ConsultationPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [medicalNote, setMedicalNote] = useState<MedicalNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("recording");

  const fetchConsultation = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("consultations")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setConsultation(data as Consultation);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load consultation",
        variant: "destructive",
      });
      navigate("/");
    }
  }, [id, navigate, toast]);

  const fetchMedicalNote = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("medical_notes")
        .select("*")
        .eq("consultation_id", id)
        .maybeSingle();

      if (error && ((error as DBError).code ?? "") !== "PGRST116") throw error;
      setMedicalNote(data as MedicalNote);
      if (data) setActiveTab("notes");
    } catch (error: unknown) {
      console.error("Error fetching medical note:", error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchConsultation();
      fetchMedicalNote();
    }
  }, [id, fetchConsultation, fetchMedicalNote]);

  // 🔑 Centralized handler for transcript
  const handleTranscriptionComplete = async (
    transcript: string,
    audioBlob?: Blob
  ) => {
    setIsProcessing(true);
    try {
      if (!transcript?.trim()) {
        const placeholderText =
          "Audio recorded but transcription failed. Please review manually.";
        const { data, error } = await supabase
          .from("medical_notes")
          .upsert({
            consultation_id: id,
            subjective: placeholderText,
            objective: "",
            assessment: "",
            plan: "",
            raw_transcript: "Transcription failed",
            extracted_entities: {},
            is_reviewed: false,
          })
          .select()
          .single();
        if (error) throw error;
        setMedicalNote(data as MedicalNote);
        setActiveTab("notes");
        toast({
          title: "Note Created",
          description: "Audio recorded but transcription failed. Please review manually.",
          variant: "destructive",
        });
        return;
      }

      // ✅ Call Edge Function
      const { data: fnResponse, error: fnError } =
        await supabase.functions.invoke("generate-soap-note", {
          body: { transcript },
        });

      if (fnError) throw fnError;
      console.log("Edge function response:", fnResponse);

      const soap = fnResponse?.soap || {};
      const medicalTerms = fnResponse?.medicalTerms || {};

      // ✅ Save SOAP info to Supabase
      const { data, error } = await supabase
        .from("medical_notes")
        .upsert({
          consultation_id: id,
          subjective: soap.subjective || transcript,
          objective: soap.objective || "",
          assessment: soap.assessment || "",
          plan: soap.plan || "",
          raw_transcript: transcript,
          extracted_entities: medicalTerms,
          is_reviewed: false,
        })
        .select()
        .single();

      if (error) throw error;

      setMedicalNote(data as MedicalNote);
      setActiveTab("notes");

      toast({
        title: "SOAP Note Generated",
        description: "Transcript processed into structured SOAP notes.",
      });
    } catch (error) {
      console.error("Transcription processing error:", error);
      toast({
        title: "Processing Error",
        description: "Failed to generate medical note. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // 📂 Handle transcript file upload
  const handleTranscriptUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await handleTranscriptionComplete(text);
  };

  // 🎙️ Handle audio file upload (will transcribe first via your audio function)
  const handleAudioUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);

      // TODO: Replace with your existing `transcribeAudio` function
      const formData = new FormData();
      formData.append("file", file);

      const resp = await fetch("/api/transcribe-audio", {
        method: "POST",
        body: formData,
      });

      const result = await resp.json();
      const transcript = result.transcript;

      await handleTranscriptionComplete(transcript, file);
    } catch (err) {
      console.error("Audio upload error:", err);
      toast({
        title: "Upload Error",
        description: "Failed to transcribe audio file",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveNote = async (note: MedicalNote) => {
    const { error } = await supabase
      .from("medical_notes")
      .update({
        subjective: note.subjective,
        objective: note.objective,
        assessment: note.assessment,
        plan: note.plan,
        is_reviewed: true,
      })
      .eq("id", note.id);

    if (error) throw error;
    setMedicalNote((prev) =>
      prev ? { ...prev, ...note, is_reviewed: true } : null
    );
  };

  const handleCompleteConsultation = async () => {
    try {
      const { error } = await supabase
        .from("consultations")
        .update({ status: "completed" })
        .eq("id", id);

      if (error) throw error;

      setConsultation((prev) =>
        prev ? { ...prev, status: "completed" } : null
      );

      toast({
        title: "Consultation Completed",
        description: "Consultation has been marked as completed.",
      });
    } catch (error: unknown) {
      console.error("Complete consultation error:", error);
      toast({
        title: "Error",
        description: "Failed to complete consultation",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "in_progress":
        return <Badge variant="default">In Progress</Badge>;
      case "completed":
        return (
          <Badge className="bg-accent text-accent-foreground">Completed</Badge>
        );
      case "cancelled":
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading || !consultation) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading consultation...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={() => navigate("/")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
              <div className="h-6 w-px bg-border" />
              <div>
                <h1 className="text-2xl font-bold">Consultation</h1>
                <p className="text-sm text-muted-foreground">
                  {consultation.patient_name}
                  {consultation.patient_id && ` • ID: ${consultation.patient_id}`}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {getStatusBadge(consultation.status)}
              {consultation.status === "in_progress" &&
                medicalNote?.is_reviewed && (
                  <Button
                    onClick={handleCompleteConsultation}
                    className="bg-accent hover:bg-accent/90"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Complete Consultation
                  </Button>
                )}
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Consultation Info */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-center space-x-3">
                <User className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Patient</p>
                  <p className="text-lg">{consultation.patient_name}</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Date</p>
                  <p className="text-lg">
                    {formatDate(consultation.consultation_date)}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Duration</p>
                  <p className="text-lg">
                    {consultation.duration_minutes
                      ? `${consultation.duration_minutes} min`
                      : "In progress"}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="recording" className="flex items-center space-x-2">
              <Mic className="h-4 w-4" />
              <span>Recording</span>
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center space-x-2">
              <Upload className="h-4 w-4" />
              <span>Upload</span>
            </TabsTrigger>
            <TabsTrigger
              value="notes"
              className="flex items-center space-x-2"
              disabled={!medicalNote}
            >
              <FileText className="h-4 w-4" />
              <span>Medical Notes</span>
            </TabsTrigger>
          </TabsList>

          {/* Recording */}
          <TabsContent value="recording" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Audio Recording</CardTitle>
                <CardDescription>
                  Record the consultation to generate structured medical notes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AudioRecorder
                  onTranscriptionComplete={handleTranscriptionComplete}
                  isProcessing={isProcessing}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Upload */}
          <TabsContent value="upload" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Upload Transcript</CardTitle>
                <CardDescription>
                  Upload a text transcript to generate SOAP notes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <input
                  type="file"
                  accept=".txt"
                  onChange={handleTranscriptUpload}
                  className="block w-full text-sm text-muted-foreground
                             file:mr-4 file:py-2 file:px-4
                             file:rounded-md file:border-0
                             file:text-sm file:font-semibold
                             file:bg-primary file:text-white
                             hover:file:bg-primary/80"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Upload Audio File</CardTitle>
                <CardDescription>
                  Upload an audio recording (e.g., .mp3, .wav) to transcribe and
                  generate SOAP notes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleAudioUpload}
                  className="block w-full text-sm text-muted-foreground
                             file:mr-4 file:py-2 file:px-4
                             file:rounded-md file:border-0
                             file:text-sm file:font-semibold
                             file:bg-primary file:text-white
                             hover:file:bg-primary/80"
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notes */}
          <TabsContent value="notes" className="mt-6">
            {medicalNote ? (
              <SOAPEditor
                note={medicalNote}
                onSave={handleSaveNote}
                isEditing={isEditing}
                onEditToggle={() => setIsEditing(!isEditing)}
              />
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No medical notes yet</p>
                  <p className="text-sm text-muted-foreground">
                    Record or upload a consultation to generate SOAP notes
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
