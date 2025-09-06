import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Mic, MicOff, Square, Play, Pause } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface AudioRecorderProps {
  onTranscriptionComplete: (transcript: string, audioBlob: Blob) => void;
  isProcessing: boolean;
}

// Lightweight typed shapes for the Web Speech API events used here.
// We keep these narrow so we avoid using `any` and satisfy ESLint rules.
type SpeechRecognitionResultItem = { isFinal: boolean; 0: { transcript: string } };
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: {
    [index: number]: SpeechRecognitionResultItem;
    length: number;
  };
}

interface SpeechRecognitionErrorEvent extends Event {
  error?: string;
}

type SpeechRecognitionConstructor = new () => {
  continuous?: boolean;
  interimResults?: boolean;
  lang?: string;
  maxAlternatives?: number;
  onstart?: () => void;
  onresult?: (e: SpeechRecognitionEventLike) => void;
  onend?: () => void;
  onerror?: (e: SpeechRecognitionErrorEvent) => void;
  onnomatch?: () => void;
  start: () => void;
  stop: () => void;
  pause?: () => void;
  resume?: () => void;
};

export const AudioRecorder: React.FC<AudioRecorderProps> = ({
  onTranscriptionComplete,
  isProcessing,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [hasRecording, setHasRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000, // Match AssemblyAI's preferred sample rate
          channelCount: 1,   // Mono audio
        },
      });

      const supportsMp3 = MediaRecorder.isTypeSupported('audio/mpeg') || MediaRecorder.isTypeSupported('audio/mp3');
      const mimeType = supportsMp3 ? 'audio/mpeg' : 'audio/webm;codecs=opus';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      console.log('MediaRecorder created with mimeType:', mimeType);

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        setHasRecording(true);
        
        // Send to transcription service
        transcribeAudio(audioBlob);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setRecordingTime(0);
      startTimer();

      toast({
        title: "Recording Started",
        description: "Listening to consultation...",
      });
    } catch (error) {
      toast({
        title: "Recording Error",
        description: "Could not access microphone. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      stopTimer();
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      startTimer();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      stopTimer();
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      console.log('Starting transcription...', { size: audioBlob.size, type: audioBlob.type });
      
      // Use AssemblyAI Streaming API for real-time transcription
      console.log('Using AssemblyAI Streaming API...');
      await transcribeWithAssemblyAIStreaming(audioBlob);
    } catch (error) {
      console.error('Transcription error:', error);
      toast({
        title: "Transcription Error",
        description: `Failed to transcribe audio: ${error.message || 'Unknown error'}`,
        variant: "destructive",
      });
    } finally {
      setIsTranscribing(false);
    }
  };

  const transcribeWithWebSpeechAPI = async (audioBlob: Blob) => {
    return new Promise<void>((resolve, reject) => {
  const win = window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
  const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        reject(new Error('Speech recognition not supported in this browser'));
        return;
      }

      const recognition = new SpeechRecognition();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      let finalTranscript = '';
      let hasStarted = false;

      recognition.onstart = () => {
        console.log('Speech recognition started');
        hasStarted = true;
      };

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        console.log('Speech recognition result:', event);
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
            console.log('Final transcript so far:', finalTranscript);
          }
        }
      };

      recognition.onend = () => {
        console.log('Speech recognition ended. Final transcript:', finalTranscript);
        if (finalTranscript.trim()) {
          onTranscriptionComplete(finalTranscript.trim(), audioBlob);
          resolve();
        } else {
          reject(new Error('No speech detected or recognized'));
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error:', event);
        reject(new Error(`Speech recognition error: ${event.error || 'unknown'}`));
      };

      recognition.onnomatch = () => {
        console.log('No speech was recognized');
        reject(new Error('No speech was recognized'));
      };

      try {
        recognition.start();
        
        // Stop after a reasonable time (10 seconds max for Web Speech API)
        setTimeout(() => {
          if (hasStarted) {
            recognition.stop();
          }
        }, 10000);
      } catch (error) {
        reject(new Error(`Failed to start speech recognition: ${error.message}`));
      }
    });
  };

  const transcribeWithAssemblyAIStreaming = async (audioBlob: Blob) => {
    // Use backend Supabase Edge Function to handle AssemblyAI calls securely.
    // Configure the function URL via Vite env `VITE_TRANSCRIBE_FN` or default path.
    const fnUrl = import.meta.env.VITE_TRANSCRIBE_FN || '/.netlify/functions/transcribe-assemblyai';

    // Convert blob to base64
    const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    try {
      console.log('Sending audio to backend transcription function...', { size: audioBlob.size, type: audioBlob.type });
      const audioBase64 = await toBase64(audioBlob);

      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`
        },
        body: JSON.stringify({ audioBase64, mimeType: audioBlob.type }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error('Backend transcription function failed:', text);
        throw new Error(`Backend transcription failed: ${text}`);
      }

      const data = await res.json();
      if (data.error) {
        console.error('Backend returned error:', data.error);
        throw new Error(data.error);
      }

      const transcript = data.text || '';
      if (!transcript || transcript.trim().length === 0) {
        const placeholderText = 'Audio recorded but no speech was detected. Please check audio quality and try again.';
        onTranscriptionComplete(placeholderText, audioBlob);
        return;
      }

      onTranscriptionComplete(transcript, audioBlob);
      return;
    } catch (error) {
      console.error('Transcription via backend failed:', error);
      throw error;
    }
  };

  return (
    <Card className="w-full">
      <CardContent className="p-6">
        <div className="text-center space-y-4">
          {/* Recording Status */}
          <div className="flex items-center justify-center space-x-2">
            {isRecording && (
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-red-500 rounded-full recording-pulse"></div>
                <Badge variant="destructive">
                  {isPaused ? 'PAUSED' : 'RECORDING'}
                </Badge>
              </div>
            )}
            {hasRecording && !isRecording && !isTranscribing && (
              <Badge className="bg-accent text-accent-foreground">
                Recording Complete
              </Badge>
            )}
            {isTranscribing && (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
                <Badge className="bg-blue-500 text-white">
                  Transcribing...
                </Badge>
              </div>
            )}
          </div>

          {/* Timer */}
          <div className="text-2xl font-mono font-bold text-primary">
            {formatTime(recordingTime)}
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-center space-x-4">
            {!isRecording ? (
              <Button
                onClick={startRecording}
                className="bg-primary hover:bg-primary/90"
                size="lg"
                disabled={isProcessing}
              >
                <Mic className="h-5 w-5 mr-2" />
                Start Recording
              </Button>
            ) : (
              <div className="flex flex-col items-center space-y-3">
                <div className="flex items-center space-x-4">
                  {!isPaused ? (
                    <Button
                      onClick={pauseRecording}
                      variant="outline"
                      size="lg"
                    >
                      <Pause className="h-5 w-5 mr-2" />
                      Pause
                    </Button>
                  ) : (
                    <Button
                      onClick={resumeRecording}
                      className="bg-accent hover:bg-accent/90"
                      size="lg"
                    >
                      <Play className="h-5 w-5 mr-2" />
                      Resume
                    </Button>
                  )}
                </div>
                <Button
                  onClick={stopRecording}
                  variant="destructive"
                  size="lg"
                  className="bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-3"
                >
                  <Square className="h-5 w-5 mr-2" />
                  Stop Recording
                </Button>
              </div>
            )}
          </div>

          {/* Instructions */}
          <p className="text-sm text-muted-foreground">
            {!isRecording ? 
              "Click 'Start Recording' to begin capturing the consultation" :
              "Recording in progress. Click 'Stop' when consultation is complete"
            }
          </p>

          {/* Debug Test Button */}
          {!isRecording && (
            <div className="flex space-x-2">
              <Button
                onClick={() => {
                  console.log('Testing Web Speech API support:', 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
                  toast({
                    title: "Debug Info",
                    description: "Check console for API support details",
                  });
                }}
                variant="outline"
                size="sm"
              >
                Test APIs
              </Button>
              <Button
                onClick={async () => {
                  try {
                    console.log('Testing backend transcription function...');
                    const fnUrl = import.meta.env.VITE_TRANSCRIBE_FN || '/.netlify/functions/transcribe-assemblyai';
                    const response = await fetch(fnUrl, { method: 'OPTIONS' });

                    if (response.ok) {
                      console.log('Backend transcription function reachable');
                      toast({ title: "API Test", description: "Backend transcription function reachable" });
                    } else {
                      console.error('Backend transcription function test failed:', response.status, response.statusText);
                      toast({ title: "API Test Failed", description: `Function unreachable: ${response.status}`, variant: "destructive" });
                    }
                  } catch (error) {
                    console.error('Backend function test error:', error);
                    toast({ title: "API Test Error", description: "Failed to reach backend transcription function", variant: "destructive" });
                  }
                }}
                variant="outline"
                size="sm"
              >
                Test AssemblyAI
              </Button>
              <Button
                onClick={() => {
                  console.log('Audio format support:');
                  console.log('MP3:', MediaRecorder.isTypeSupported('audio/mpeg'));
                  console.log('WebM:', MediaRecorder.isTypeSupported('audio/webm;codecs=opus'));
                  console.log('WAV:', MediaRecorder.isTypeSupported('audio/wav'));
                  console.log('OGG:', MediaRecorder.isTypeSupported('audio/ogg;codecs=opus'));
                  
                  toast({
                    title: "Audio Format Test",
                    description: "Check console for supported formats",
                  });
                }}
                variant="outline"
                size="sm"
              >
                Test Audio Formats
              </Button>
              <Button
                onClick={async () => {
                  try {
                    console.log('Testing microphone access...');
                    const stream = await navigator.mediaDevices.getUserMedia({
                      audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        sampleRate: 16000,
                        channelCount: 1,
                      },
                    });
                    
                    console.log('Microphone access successful!');
                    console.log('Audio tracks:', stream.getAudioTracks().length);
                    console.log('Audio track settings:', stream.getAudioTracks()[0]?.getSettings());
                    
                    // Stop the stream
                    stream.getTracks().forEach(track => track.stop());
                    
                    toast({
                      title: "Microphone Test",
                      description: "Microphone access successful!",
                    });
                  } catch (error) {
                    console.error('Microphone test failed:', error);
                    toast({
                      title: "Microphone Test Failed",
                      description: "Could not access microphone",
                      variant: "destructive",
                    });
                  }
                }}
                variant="outline"
                size="sm"
              >
                Test Microphone
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};