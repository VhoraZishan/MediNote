import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, User, FileText, Mic } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Consultation {
  id: string;
  patient_name: string;
  patient_id: string;
  consultation_date: string;
  status: 'in_progress' | 'completed' | 'cancelled';
  duration_minutes: number | null;
}

interface ConsultationCardProps {
  consultation: Consultation;
  onUpdate: () => void;
}

export const ConsultationCard: React.FC<ConsultationCardProps> = ({
  consultation,
  onUpdate,
}) => {
  const navigate = useNavigate();

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleViewConsultation = () => {
    navigate(`/consultation/${consultation.id}`);
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-4 mb-3">
              <div className="flex items-center space-x-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{consultation.patient_name}</span>
              </div>
              {consultation.patient_id && (
                <span className="text-sm text-muted-foreground">
                  ID: {consultation.patient_id}
                </span>
              )}
              {getStatusBadge(consultation.status)}
            </div>
            
            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
              <div className="flex items-center space-x-1">
                <Calendar className="h-4 w-4" />
                <span>{formatDate(consultation.consultation_date)}</span>
              </div>
              {consultation.duration_minutes && (
                <div className="flex items-center space-x-1">
                  <Clock className="h-4 w-4" />
                  <span>{consultation.duration_minutes} min</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {consultation.status === 'in_progress' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleViewConsultation}
                className="text-primary border-primary hover:bg-primary hover:text-primary-foreground"
              >
                <Mic className="h-4 w-4 mr-1" />
                Continue
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleViewConsultation}
            >
              <FileText className="h-4 w-4 mr-1" />
              View Notes
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};