import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Plus, FileText, Clock, User, LogOut, Moon, Sun } from 'lucide-react';
import { NewConsultationDialog } from './NewConsultationDialog';
import { ConsultationCard } from './ConsultationCard';
import { useTheme } from 'next-themes';

interface Consultation {
  id: string;
  patient_name: string;
  patient_id: string;
  consultation_date: string;
  status: 'in_progress' | 'completed' | 'cancelled';
  duration_minutes: number | null;
}

export const Dashboard: React.FC = () => {
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewConsultation, setShowNewConsultation] = useState(false);
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    fetchConsultations();
  }, []);

  const fetchConsultations = async () => {
    try {
      const { data, error } = await supabase
        .from('consultations')
        .select('*')
        .order('consultation_date', { ascending: false });

      if (error) throw error;
      setConsultations(data as Consultation[] || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load consultations",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to sign out",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'in_progress':
        return <Badge variant="default">In Progress</Badge>;
      case 'completed':
        return <Badge className="bg-accent text-accent-foreground">Completed</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="p-2 bg-primary/10 rounded-lg">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">MediNote</h1>
              <p className="text-sm text-muted-foreground">AI-Powered Medical Documentation</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <div className="flex items-center space-x-2 text-sm">
              <User className="h-4 w-4" />
              <span>{user?.email}</span>
            </div>
            <Button variant="ghost" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Consultations</p>
                  <p className="text-2xl font-bold">{consultations.length}</p>
                </div>
                <FileText className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">In Progress</p>
                  <p className="text-2xl font-bold">
                    {consultations.filter(c => c.status === 'in_progress').length}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-accent" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Completed</p>
                  <p className="text-2xl font-bold">
                    {consultations.filter(c => c.status === 'completed').length}
                  </p>
                </div>
                <Badge className="h-8 w-8 bg-accent text-accent-foreground rounded-full flex items-center justify-center">
                  ✓
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Button */}
        <div className="mb-6">
          <Button
            onClick={() => setShowNewConsultation(true)}
            className="bg-primary hover:bg-primary/90"
          >
            <Plus className="h-4 w-4 mr-2" />
            Start New Consultation
          </Button>
        </div>

        {/* Consultations List */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Consultations</CardTitle>
            <CardDescription>
              Manage your patient consultations and medical notes
            </CardDescription>
          </CardHeader>
          <CardContent>
            {consultations.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No consultations yet</p>
                <p className="text-sm text-muted-foreground">Start your first consultation to begin</p>
              </div>
            ) : (
              <div className="space-y-4">
                {consultations.map((consultation) => (
                  <ConsultationCard
                    key={consultation.id}
                    consultation={consultation}
                    onUpdate={fetchConsultations}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <NewConsultationDialog
        open={showNewConsultation}
        onOpenChange={setShowNewConsultation}
        onSuccess={fetchConsultations}
      />
    </div>
  );
};