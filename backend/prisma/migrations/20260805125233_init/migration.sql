-- CreateTable
CREATE TABLE "AccountInfo" (
    "AccountKey" SERIAL NOT NULL,
    "Email" TEXT NOT NULL,
    "HashedPassword" TEXT NOT NULL,
    "UserID" TEXT NOT NULL,
    "UserFName" TEXT NOT NULL,
    "UserLName" TEXT NOT NULL,
    "UserCredit" INTEGER NOT NULL,
    "RoleKey" INTEGER NOT NULL,

    CONSTRAINT "AccountInfo_pkey" PRIMARY KEY ("AccountKey")
);

-- CreateTable
CREATE TABLE "RoleInfo" (
    "RoleKey" SERIAL NOT NULL,
    "RoleName" TEXT NOT NULL,

    CONSTRAINT "RoleInfo_pkey" PRIMARY KEY ("RoleKey")
);

-- CreateTable
CREATE TABLE "FacultyInfo" (
    "FacultyKey" SERIAL NOT NULL,
    "FacultyName" TEXT NOT NULL,
    "BranchName" TEXT,
    "ManageGroupKey" INTEGER NOT NULL,

    CONSTRAINT "FacultyInfo_pkey" PRIMARY KEY ("FacultyKey")
);

-- CreateTable
CREATE TABLE "ManagementGroup" (
    "ManageGroupKey" SERIAL NOT NULL,
    "GroupType" INTEGER NOT NULL,

    CONSTRAINT "ManagementGroup_pkey" PRIMARY KEY ("ManageGroupKey")
);

-- CreateTable
CREATE TABLE "GroupType" (
    "GroupTypeKey" SERIAL NOT NULL,
    "GroupTypeName" TEXT NOT NULL,

    CONSTRAINT "GroupType_pkey" PRIMARY KEY ("GroupTypeKey")
);

-- CreateTable
CREATE TABLE "Authority" (
    "AuthorityKey" SERIAL NOT NULL,
    "AccountKey" INTEGER NOT NULL,
    "ManageGroupKey" INTEGER NOT NULL,
    "AuthorityRoleKey" INTEGER NOT NULL,

    CONSTRAINT "Authority_pkey" PRIMARY KEY ("AuthorityKey")
);

-- CreateTable
CREATE TABLE "AuthorityRole" (
    "AuthorityRoleKey" SERIAL NOT NULL,
    "AuthorityName" TEXT NOT NULL,
    "AuthorityLevel" INTEGER,

    CONSTRAINT "AuthorityRole_pkey" PRIMARY KEY ("AuthorityRoleKey")
);

-- CreateTable
CREATE TABLE "ClubInfo" (
    "ClubKey" SERIAL NOT NULL,
    "ClubName" TEXT,
    "ManageGroupKey" INTEGER NOT NULL,

    CONSTRAINT "ClubInfo_pkey" PRIMARY KEY ("ClubKey")
);

-- CreateTable
CREATE TABLE "ItemInfo" (
    "ItemKey" SERIAL NOT NULL,
    "ItemName" TEXT,
    "ItemDesc" TEXT,
    "ImageURL" TEXT,
    "CreditWeight" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ItemInfo_pkey" PRIMARY KEY ("ItemKey")
);

-- CreateTable
CREATE TABLE "ItemIndiv" (
    "IndivKey" SERIAL NOT NULL,
    "ResourceKey" INTEGER NOT NULL,
    "ItemKey" INTEGER NOT NULL,
    "ItemID" TEXT NOT NULL,
    "ImageURL" TEXT,

    CONSTRAINT "ItemIndiv_pkey" PRIMARY KEY ("IndivKey")
);

-- CreateTable
CREATE TABLE "RoomInfo" (
    "RoomKey" SERIAL NOT NULL,
    "ResourceKey" INTEGER NOT NULL,
    "RoomName" TEXT,
    "RoomDesc" TEXT,
    "RoomLocation" TEXT,
    "ImageURL" TEXT,
    "CreditWeight" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "RoomInfo_pkey" PRIMARY KEY ("RoomKey")
);

-- CreateTable
CREATE TABLE "ResourceInfo" (
    "ResourceKey" SERIAL NOT NULL,
    "ManagedBy" INTEGER NOT NULL,
    "BorrowRule" INTEGER NOT NULL,
    "ConditionKey" INTEGER,
    "ResourceStatus" INTEGER NOT NULL,
    "BufferTime" INTEGER NOT NULL,
    "AllowBorrow" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ResourceInfo_pkey" PRIMARY KEY ("ResourceKey")
);

-- CreateTable
CREATE TABLE "ResourceStatus" (
    "StatusKey" SERIAL NOT NULL,
    "StatusName" TEXT,

    CONSTRAINT "ResourceStatus_pkey" PRIMARY KEY ("StatusKey")
);

-- CreateTable
CREATE TABLE "ConditionLog" (
    "ConditionKey" SERIAL NOT NULL,
    "ResourceKey" INTEGER NOT NULL,
    "LoggedBy" INTEGER NOT NULL,
    "Condition" INTEGER NOT NULL,
    "Notes" TEXT,
    "LoggedAt" TIMESTAMP(3),

    CONSTRAINT "ConditionLog_pkey" PRIMARY KEY ("ConditionKey")
);

-- CreateTable
CREATE TABLE "ConditionType" (
    "ConditionTypeKey" SERIAL NOT NULL,
    "ConditionName" TEXT,

    CONSTRAINT "ConditionType_pkey" PRIMARY KEY ("ConditionTypeKey")
);

-- CreateTable
CREATE TABLE "BorrowRule" (
    "BorrowRuleKey" SERIAL NOT NULL,
    "RuleName" TEXT,

    CONSTRAINT "BorrowRule_pkey" PRIMARY KEY ("BorrowRuleKey")
);

-- CreateTable
CREATE TABLE "BorrowConstraints" (
    "ConstraintsKey" SERIAL NOT NULL,
    "BorrowRuleKey" INTEGER NOT NULL,
    "CreditTierKey" INTEGER NOT NULL,
    "MinimumAuthorityLevel" INTEGER,
    "MaxBorrowDate" INTEGER NOT NULL,
    "MaxExtendTime" INTEGER NOT NULL,

    CONSTRAINT "BorrowConstraints_pkey" PRIMARY KEY ("ConstraintsKey")
);

-- CreateTable
CREATE TABLE "PenaltyRule" (
    "PenaltyRuleKey" SERIAL NOT NULL,
    "BorrowRuleKey" INTEGER NOT NULL,
    "PenaltyTypeKey" INTEGER NOT NULL,
    "PenaltyAmount" INTEGER NOT NULL,
    "PenaltyLength" INTEGER NOT NULL,

    CONSTRAINT "PenaltyRule_pkey" PRIMARY KEY ("PenaltyRuleKey")
);

-- CreateTable
CREATE TABLE "PenaltyType" (
    "PenaltyTypeKey" SERIAL NOT NULL,
    "PenaltyType" TEXT,

    CONSTRAINT "PenaltyType_pkey" PRIMARY KEY ("PenaltyTypeKey")
);

-- CreateTable
CREATE TABLE "Eligibility" (
    "EliKey" SERIAL NOT NULL,
    "ResourceKey" INTEGER NOT NULL,
    "GroupKey" INTEGER NOT NULL,
    "RoleKey" INTEGER NOT NULL,

    CONSTRAINT "Eligibility_pkey" PRIMARY KEY ("EliKey")
);

-- CreateTable
CREATE TABLE "CreditTier" (
    "CreditTierKey" SERIAL NOT NULL,
    "CreditTierName" TEXT,
    "CreditMin" INTEGER NOT NULL,
    "CreditMax" INTEGER NOT NULL,

    CONSTRAINT "CreditTier_pkey" PRIMARY KEY ("CreditTierKey")
);

-- CreateTable
CREATE TABLE "Reservations" (
    "ReservationKey" SERIAL NOT NULL,
    "ResourceKey" INTEGER NOT NULL,
    "ReservedBy" INTEGER NOT NULL,
    "Reason" TEXT,
    "StartTime" TIMESTAMP(3) NOT NULL,
    "EndTime" TIMESTAMP(3) NOT NULL,
    "ApproveStatus" INTEGER NOT NULL,
    "ApprovedBy" INTEGER,
    "ReservationExpiration" TIMESTAMP(3) NOT NULL,
    "ActionTime" TIMESTAMP(3) NOT NULL,
    "ResolvedAt" TIMESTAMP(3),

    CONSTRAINT "Reservations_pkey" PRIMARY KEY ("ReservationKey")
);

-- CreateTable
CREATE TABLE "ApproveStatus" (
    "ApproveStatusKey" SERIAL NOT NULL,
    "StatusName" TEXT NOT NULL,

    CONSTRAINT "ApproveStatus_pkey" PRIMARY KEY ("ApproveStatusKey")
);

-- CreateTable
CREATE TABLE "UsageLog" (
    "UsageKey" SERIAL NOT NULL,
    "ReservationKey" INTEGER,
    "AccountKey" INTEGER NOT NULL,
    "ResourceKey" INTEGER NOT NULL,
    "CurrentStatus" INTEGER NOT NULL,
    "DueTime" TIMESTAMP(3) NOT NULL,
    "PendingExtension" INTEGER,
    "CheckoutTime" TIMESTAMP(3) NOT NULL,
    "CheckInTime" TIMESTAMP(3),
    "CheckoutCondition" INTEGER NOT NULL,
    "CheckInCondition" INTEGER,

    CONSTRAINT "UsageLog_pkey" PRIMARY KEY ("UsageKey")
);

-- CreateTable
CREATE TABLE "ExtensionRequest" (
    "ExtensionKey" SERIAL NOT NULL,
    "UsageKey" INTEGER NOT NULL,
    "RequestedBy" INTEGER NOT NULL,
    "ExtendNo" INTEGER,
    "PreviousDueTime" TIMESTAMP(3) NOT NULL,
    "RequestedDueTime" TIMESTAMP(3) NOT NULL,
    "ApproveStatus" INTEGER NOT NULL,
    "ApprovedBy" INTEGER,
    "RequestedAt" TIMESTAMP(3) NOT NULL,
    "ResolvedAt" TIMESTAMP(3),

    CONSTRAINT "ExtensionRequest_pkey" PRIMARY KEY ("ExtensionKey")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "InspectionKey" SERIAL NOT NULL,
    "UsageKey" INTEGER NOT NULL,
    "ResourceKey" INTEGER NOT NULL,
    "InspectorKey" INTEGER NOT NULL,
    "ConditionKey" INTEGER NOT NULL,
    "AppealKey" INTEGER,
    "PenaltyKey" INTEGER,
    "ActionTime" TIMESTAMP(3),
    "Notes" TEXT,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("InspectionKey")
);

-- CreateTable
CREATE TABLE "PenaltyInfo" (
    "PenaltyKey" SERIAL NOT NULL,
    "AccountKey" INTEGER NOT NULL,
    "UsageKey" INTEGER,
    "Reason" TEXT,
    "CreditDeducted" INTEGER,
    "ActionTime" TIMESTAMP(3),
    "ExpirationTime" TIMESTAMP(3) NOT NULL,
    "Appealed" BOOLEAN,
    "InEffect" BOOLEAN,

    CONSTRAINT "PenaltyInfo_pkey" PRIMARY KEY ("PenaltyKey")
);

-- CreateTable
CREATE TABLE "AppealInfo" (
    "AppealKey" SERIAL NOT NULL,
    "OriginalPenalty" INTEGER NOT NULL,
    "NewPenalty" INTEGER,
    "FiledBy" INTEGER NOT NULL,
    "ResolvedBy" INTEGER,
    "AppealReason" TEXT,
    "ApproveStatus" INTEGER NOT NULL,
    "ActionTime" TIMESTAMP(3),
    "ResolvedAt" TIMESTAMP(3),

    CONSTRAINT "AppealInfo_pkey" PRIMARY KEY ("AppealKey")
);

-- CreateTable
CREATE TABLE "Images" (
    "ImageKey" SERIAL NOT NULL,
    "SubmittedBy" INTEGER NOT NULL,
    "UsageKey" INTEGER NOT NULL,
    "ResourceKey" INTEGER NOT NULL,
    "InspectionKey" INTEGER,
    "ImageURL" TEXT NOT NULL,
    "SubmissionType" INTEGER NOT NULL,
    "ActionTime" TIMESTAMP(3),

    CONSTRAINT "Images_pkey" PRIMARY KEY ("ImageKey")
);

-- CreateTable
CREATE TABLE "ImageSubmissionType" (
    "SubmissionTypeKey" SERIAL NOT NULL,
    "SubmissionType" TEXT NOT NULL,

    CONSTRAINT "ImageSubmissionType_pkey" PRIMARY KEY ("SubmissionTypeKey")
);

-- CreateTable
CREATE TABLE "Notification" (
    "NotificationKey" SERIAL NOT NULL,
    "AccountKey" INTEGER NOT NULL,
    "NotificationType" INTEGER NOT NULL,
    "NotificationContent" TEXT NOT NULL,
    "SentTime" TIMESTAMP(3),
    "IsRead" BOOLEAN,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("NotificationKey")
);

-- CreateTable
CREATE TABLE "NotificationType" (
    "NotificationTypeKey" SERIAL NOT NULL,
    "NotificationTypeName" TEXT NOT NULL,

    CONSTRAINT "NotificationType_pkey" PRIMARY KEY ("NotificationTypeKey")
);

-- CreateTable
CREATE TABLE "RepairLog" (
    "RepairKey" SERIAL NOT NULL,
    "ReservationKey" INTEGER,
    "RepairedBy" INTEGER NOT NULL,
    "ResourceKey" INTEGER NOT NULL,
    "BeginRepairDate" TIMESTAMP(3) NOT NULL,
    "EndRepairDate" TIMESTAMP(3),
    "ConditionBeforeRepair" INTEGER NOT NULL,
    "ConditionAfterRepair" INTEGER,

    CONSTRAINT "RepairLog_pkey" PRIMARY KEY ("RepairKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "FacultyInfo_ManageGroupKey_key" ON "FacultyInfo"("ManageGroupKey");

-- CreateIndex
CREATE UNIQUE INDEX "Authority_AccountKey_ManageGroupKey_key" ON "Authority"("AccountKey", "ManageGroupKey");

-- CreateIndex
CREATE UNIQUE INDEX "ClubInfo_ManageGroupKey_key" ON "ClubInfo"("ManageGroupKey");

-- CreateIndex
CREATE UNIQUE INDEX "ItemIndiv_ResourceKey_key" ON "ItemIndiv"("ResourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "RoomInfo_ResourceKey_key" ON "RoomInfo"("ResourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "BorrowConstraints_BorrowRuleKey_CreditTierKey_key" ON "BorrowConstraints"("BorrowRuleKey", "CreditTierKey");

-- CreateIndex
CREATE UNIQUE INDEX "PenaltyRule_BorrowRuleKey_PenaltyTypeKey_key" ON "PenaltyRule"("BorrowRuleKey", "PenaltyTypeKey");

-- CreateIndex
CREATE UNIQUE INDEX "Eligibility_GroupKey_ResourceKey_RoleKey_key" ON "Eligibility"("GroupKey", "ResourceKey", "RoleKey");

-- CreateIndex
CREATE UNIQUE INDEX "AppealInfo_OriginalPenalty_key" ON "AppealInfo"("OriginalPenalty");

-- AddForeignKey
ALTER TABLE "AccountInfo" ADD CONSTRAINT "AccountInfo_RoleKey_fkey" FOREIGN KEY ("RoleKey") REFERENCES "RoleInfo"("RoleKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacultyInfo" ADD CONSTRAINT "FacultyInfo_ManageGroupKey_fkey" FOREIGN KEY ("ManageGroupKey") REFERENCES "ManagementGroup"("ManageGroupKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagementGroup" ADD CONSTRAINT "ManagementGroup_GroupType_fkey" FOREIGN KEY ("GroupType") REFERENCES "GroupType"("GroupTypeKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authority" ADD CONSTRAINT "Authority_AccountKey_fkey" FOREIGN KEY ("AccountKey") REFERENCES "AccountInfo"("AccountKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authority" ADD CONSTRAINT "Authority_ManageGroupKey_fkey" FOREIGN KEY ("ManageGroupKey") REFERENCES "ManagementGroup"("ManageGroupKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authority" ADD CONSTRAINT "Authority_AuthorityRoleKey_fkey" FOREIGN KEY ("AuthorityRoleKey") REFERENCES "AuthorityRole"("AuthorityRoleKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubInfo" ADD CONSTRAINT "ClubInfo_ManageGroupKey_fkey" FOREIGN KEY ("ManageGroupKey") REFERENCES "ManagementGroup"("ManageGroupKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemIndiv" ADD CONSTRAINT "ItemIndiv_ItemKey_fkey" FOREIGN KEY ("ItemKey") REFERENCES "ItemInfo"("ItemKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemIndiv" ADD CONSTRAINT "ItemIndiv_ResourceKey_fkey" FOREIGN KEY ("ResourceKey") REFERENCES "ResourceInfo"("ResourceKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomInfo" ADD CONSTRAINT "RoomInfo_ResourceKey_fkey" FOREIGN KEY ("ResourceKey") REFERENCES "ResourceInfo"("ResourceKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceInfo" ADD CONSTRAINT "ResourceInfo_ManagedBy_fkey" FOREIGN KEY ("ManagedBy") REFERENCES "ManagementGroup"("ManageGroupKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceInfo" ADD CONSTRAINT "ResourceInfo_BorrowRule_fkey" FOREIGN KEY ("BorrowRule") REFERENCES "BorrowRule"("BorrowRuleKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceInfo" ADD CONSTRAINT "ResourceInfo_ConditionKey_fkey" FOREIGN KEY ("ConditionKey") REFERENCES "ConditionLog"("ConditionKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceInfo" ADD CONSTRAINT "ResourceInfo_ResourceStatus_fkey" FOREIGN KEY ("ResourceStatus") REFERENCES "ResourceStatus"("StatusKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConditionLog" ADD CONSTRAINT "ConditionLog_ResourceKey_fkey" FOREIGN KEY ("ResourceKey") REFERENCES "ResourceInfo"("ResourceKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConditionLog" ADD CONSTRAINT "ConditionLog_LoggedBy_fkey" FOREIGN KEY ("LoggedBy") REFERENCES "AccountInfo"("AccountKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConditionLog" ADD CONSTRAINT "ConditionLog_Condition_fkey" FOREIGN KEY ("Condition") REFERENCES "ConditionType"("ConditionTypeKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowConstraints" ADD CONSTRAINT "BorrowConstraints_BorrowRuleKey_fkey" FOREIGN KEY ("BorrowRuleKey") REFERENCES "BorrowRule"("BorrowRuleKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowConstraints" ADD CONSTRAINT "BorrowConstraints_CreditTierKey_fkey" FOREIGN KEY ("CreditTierKey") REFERENCES "CreditTier"("CreditTierKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenaltyRule" ADD CONSTRAINT "PenaltyRule_BorrowRuleKey_fkey" FOREIGN KEY ("BorrowRuleKey") REFERENCES "BorrowRule"("BorrowRuleKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenaltyRule" ADD CONSTRAINT "PenaltyRule_PenaltyTypeKey_fkey" FOREIGN KEY ("PenaltyTypeKey") REFERENCES "PenaltyType"("PenaltyTypeKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Eligibility" ADD CONSTRAINT "Eligibility_ResourceKey_fkey" FOREIGN KEY ("ResourceKey") REFERENCES "ResourceInfo"("ResourceKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Eligibility" ADD CONSTRAINT "Eligibility_GroupKey_fkey" FOREIGN KEY ("GroupKey") REFERENCES "ManagementGroup"("ManageGroupKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Eligibility" ADD CONSTRAINT "Eligibility_RoleKey_fkey" FOREIGN KEY ("RoleKey") REFERENCES "AuthorityRole"("AuthorityRoleKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservations" ADD CONSTRAINT "Reservations_ResourceKey_fkey" FOREIGN KEY ("ResourceKey") REFERENCES "ResourceInfo"("ResourceKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservations" ADD CONSTRAINT "Reservations_ReservedBy_fkey" FOREIGN KEY ("ReservedBy") REFERENCES "AccountInfo"("AccountKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservations" ADD CONSTRAINT "Reservations_ApproveStatus_fkey" FOREIGN KEY ("ApproveStatus") REFERENCES "ApproveStatus"("ApproveStatusKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageLog" ADD CONSTRAINT "UsageLog_ReservationKey_fkey" FOREIGN KEY ("ReservationKey") REFERENCES "Reservations"("ReservationKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageLog" ADD CONSTRAINT "UsageLog_AccountKey_fkey" FOREIGN KEY ("AccountKey") REFERENCES "AccountInfo"("AccountKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageLog" ADD CONSTRAINT "UsageLog_ResourceKey_fkey" FOREIGN KEY ("ResourceKey") REFERENCES "ResourceInfo"("ResourceKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageLog" ADD CONSTRAINT "UsageLog_CurrentStatus_fkey" FOREIGN KEY ("CurrentStatus") REFERENCES "ResourceStatus"("StatusKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageLog" ADD CONSTRAINT "UsageLog_PendingExtension_fkey" FOREIGN KEY ("PendingExtension") REFERENCES "ExtensionRequest"("ExtensionKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageLog" ADD CONSTRAINT "UsageLog_CheckoutCondition_fkey" FOREIGN KEY ("CheckoutCondition") REFERENCES "ConditionLog"("ConditionKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageLog" ADD CONSTRAINT "UsageLog_CheckInCondition_fkey" FOREIGN KEY ("CheckInCondition") REFERENCES "ConditionLog"("ConditionKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtensionRequest" ADD CONSTRAINT "ExtensionRequest_UsageKey_fkey" FOREIGN KEY ("UsageKey") REFERENCES "UsageLog"("UsageKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtensionRequest" ADD CONSTRAINT "ExtensionRequest_RequestedBy_fkey" FOREIGN KEY ("RequestedBy") REFERENCES "AccountInfo"("AccountKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtensionRequest" ADD CONSTRAINT "ExtensionRequest_ApprovedBy_fkey" FOREIGN KEY ("ApprovedBy") REFERENCES "AccountInfo"("AccountKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtensionRequest" ADD CONSTRAINT "ExtensionRequest_ApproveStatus_fkey" FOREIGN KEY ("ApproveStatus") REFERENCES "ApproveStatus"("ApproveStatusKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_UsageKey_fkey" FOREIGN KEY ("UsageKey") REFERENCES "UsageLog"("UsageKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_ResourceKey_fkey" FOREIGN KEY ("ResourceKey") REFERENCES "ResourceInfo"("ResourceKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_InspectorKey_fkey" FOREIGN KEY ("InspectorKey") REFERENCES "AccountInfo"("AccountKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_ConditionKey_fkey" FOREIGN KEY ("ConditionKey") REFERENCES "ConditionLog"("ConditionKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_AppealKey_fkey" FOREIGN KEY ("AppealKey") REFERENCES "AppealInfo"("AppealKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_PenaltyKey_fkey" FOREIGN KEY ("PenaltyKey") REFERENCES "PenaltyInfo"("PenaltyKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenaltyInfo" ADD CONSTRAINT "PenaltyInfo_AccountKey_fkey" FOREIGN KEY ("AccountKey") REFERENCES "AccountInfo"("AccountKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenaltyInfo" ADD CONSTRAINT "PenaltyInfo_UsageKey_fkey" FOREIGN KEY ("UsageKey") REFERENCES "UsageLog"("UsageKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppealInfo" ADD CONSTRAINT "AppealInfo_OriginalPenalty_fkey" FOREIGN KEY ("OriginalPenalty") REFERENCES "PenaltyInfo"("PenaltyKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppealInfo" ADD CONSTRAINT "AppealInfo_NewPenalty_fkey" FOREIGN KEY ("NewPenalty") REFERENCES "PenaltyInfo"("PenaltyKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppealInfo" ADD CONSTRAINT "AppealInfo_FiledBy_fkey" FOREIGN KEY ("FiledBy") REFERENCES "AccountInfo"("AccountKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppealInfo" ADD CONSTRAINT "AppealInfo_ResolvedBy_fkey" FOREIGN KEY ("ResolvedBy") REFERENCES "AccountInfo"("AccountKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppealInfo" ADD CONSTRAINT "AppealInfo_ApproveStatus_fkey" FOREIGN KEY ("ApproveStatus") REFERENCES "ApproveStatus"("ApproveStatusKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Images" ADD CONSTRAINT "Images_SubmittedBy_fkey" FOREIGN KEY ("SubmittedBy") REFERENCES "AccountInfo"("AccountKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Images" ADD CONSTRAINT "Images_UsageKey_fkey" FOREIGN KEY ("UsageKey") REFERENCES "UsageLog"("UsageKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Images" ADD CONSTRAINT "Images_ResourceKey_fkey" FOREIGN KEY ("ResourceKey") REFERENCES "ResourceInfo"("ResourceKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Images" ADD CONSTRAINT "Images_InspectionKey_fkey" FOREIGN KEY ("InspectionKey") REFERENCES "Inspection"("InspectionKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Images" ADD CONSTRAINT "Images_SubmissionType_fkey" FOREIGN KEY ("SubmissionType") REFERENCES "ImageSubmissionType"("SubmissionTypeKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_AccountKey_fkey" FOREIGN KEY ("AccountKey") REFERENCES "AccountInfo"("AccountKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_NotificationType_fkey" FOREIGN KEY ("NotificationType") REFERENCES "NotificationType"("NotificationTypeKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairLog" ADD CONSTRAINT "RepairLog_ReservationKey_fkey" FOREIGN KEY ("ReservationKey") REFERENCES "Reservations"("ReservationKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairLog" ADD CONSTRAINT "RepairLog_RepairedBy_fkey" FOREIGN KEY ("RepairedBy") REFERENCES "AccountInfo"("AccountKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairLog" ADD CONSTRAINT "RepairLog_ResourceKey_fkey" FOREIGN KEY ("ResourceKey") REFERENCES "ResourceInfo"("ResourceKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairLog" ADD CONSTRAINT "RepairLog_ConditionBeforeRepair_fkey" FOREIGN KEY ("ConditionBeforeRepair") REFERENCES "ConditionLog"("ConditionKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairLog" ADD CONSTRAINT "RepairLog_ConditionAfterRepair_fkey" FOREIGN KEY ("ConditionAfterRepair") REFERENCES "ConditionLog"("ConditionKey") ON DELETE SET NULL ON UPDATE CASCADE;
