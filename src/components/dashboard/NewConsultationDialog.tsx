import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { useNavigate } from 'react-router-dom';

interface NewConsultationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const NewConsultationDialog: React.FC<NewConsultationDialogProps> = ({
  open,
  onOpenChange,
  onSuccess,
}) => {
  const [patientName, setPatientName] = useState('');
  const [patientId, setPatientId] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('consultations')
        .insert({
          patient_name: patientName,
          patient_id: patientId || null,
          doctor_id: (await supabase.auth.getUser()).data.user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Consultation Started",
        description: `New consultation created for ${patientName}`,
      });

      onSuccess();
      onOpenChange(false);
      navigate(`/consultation/${data.id}`);
      
      // Reset form
      setPatientName('');
      setPatientId('');
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to create consultation",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Start New Consultation</DialogTitle>
          <DialogDescription>
            Enter patient information to begin a new medical consultation.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="patientName">Patient Name *</Label>
              <Input
                id="patientName"
                placeholder="John Doe"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="patientId">Patient ID (Optional)</Label>
              <Input
                id="patientId"
                placeholder="P12345"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Start Consultation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};