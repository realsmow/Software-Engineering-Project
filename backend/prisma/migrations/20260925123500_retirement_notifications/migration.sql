-- FR-EQP-08: retirement decisions currently notify nobody. Add the two
-- notification types needed to tell (a) supervisors with authority over a
-- resource's department when staff request its retirement, and (b) the
-- requesting staff member when a supervisor decides it.
ALTER TYPE "NotificationType" ADD VALUE 'RetirementRequested';
ALTER TYPE "NotificationType" ADD VALUE 'RetirementDecided';
