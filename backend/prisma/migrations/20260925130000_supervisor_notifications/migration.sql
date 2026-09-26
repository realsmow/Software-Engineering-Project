-- FR-NTF-04: supervisors currently only learn of a T2/low-credit request,
-- an extension, or an appeal by opening their queue. Add the two
-- notification types needed to tell them one is waiting.
ALTER TYPE "NotificationType" ADD VALUE 'SupervisorApprovalNeeded';
ALTER TYPE "NotificationType" ADD VALUE 'AppealFiled';
