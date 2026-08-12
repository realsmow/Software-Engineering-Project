-- CreateEnum
CREATE TYPE "GroupType" AS ENUM ('Club', 'Faculty');

-- CreateEnum
CREATE TYPE "ResourceStatus" AS ENUM ('InStorage', 'Lending', 'Missing');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('Room', 'Item');

-- CreateEnum
CREATE TYPE "ConditionStatus" AS ENUM ('Usable', 'MinorDamage', 'Broken', 'Missing');

-- CreateEnum
CREATE TYPE "ApproveStatus" AS ENUM ('Pending', 'Approved', 'Denied', 'Canceled');

-- CreateEnum
CREATE TYPE "CurrentStatus" AS ENUM ('Pending', 'Prepared', 'Lended', 'Returned', 'Inspected');

-- CreateEnum
CREATE TYPE "PenaltyReason" AS ENUM ('DamagedItem', 'BrokenItem', 'LostItem', 'DidntReturn', 'ReturnLate');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('NoProblem', 'MinorDamage', 'SignificantDamage', 'Broken');

-- CreateEnum
CREATE TYPE "PenaltyStatus" AS ENUM ('InEffect', 'Appealed', 'Ended');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('Announcement', 'Approval', 'Warning');

-- CreateEnum
CREATE TYPE "SubmissionType" AS ENUM ('BeforePicture', 'AfterPicture', 'InspectionPicture');

-- CreateTable
CREATE TABLE "Account" (
    "AccountKey" SERIAL NOT NULL,
    "Email" VARCHAR(256) NOT NULL,
    "HashedPassword" VARCHAR(256) NOT NULL,
    "AccountID" VARCHAR(256) NOT NULL,
    "FName" VARCHAR(256) NOT NULL,
    "LName" VARCHAR(256) NOT NULL,
    "Credit" INTEGER NOT NULL,
    "IsAdmin" BOOLEAN NOT NULL DEFAULT false,
    "IsSuspended" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("AccountKey")
);

-- CreateTable
CREATE TABLE "ManagementGroup" (
    "ManageGroupKey" SERIAL NOT NULL,
    "GroupType" "GroupType" NOT NULL,

    CONSTRAINT "ManagementGroup_pkey" PRIMARY KEY ("ManageGroupKey")
);

-- CreateTable
CREATE TABLE "Branch" (
    "BranchKey" SERIAL NOT NULL,
    "ManageGroupKey" INTEGER NOT NULL,
    "FacultyKey" INTEGER,
    "BranchName" VARCHAR(256),

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("BranchKey")
);

-- CreateTable
CREATE TABLE "Faculty" (
    "FacultyKey" SERIAL NOT NULL,
    "FacultyName" VARCHAR(256),

    CONSTRAINT "Faculty_pkey" PRIMARY KEY ("FacultyKey")
);

-- CreateTable
CREATE TABLE "Club" (
    "ClubKey" SERIAL NOT NULL,
    "ManageGroupKey" INTEGER NOT NULL,
    "ClubName" VARCHAR(256),

    CONSTRAINT "Club_pkey" PRIMARY KEY ("ClubKey")
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
CREATE TABLE "Resource" (
    "ResourceKey" SERIAL NOT NULL,
    "ManageGroupKey" INTEGER NOT NULL,
    "BorrowRuleKey" INTEGER NOT NULL,
    "ConditionKey" INTEGER,
    "ResourceStatus" "ResourceStatus" NOT NULL,
    "ResourceType" "ResourceType" NOT NULL,
    "ResourceDescription" TEXT,
    "BufferTime" INTEGER NOT NULL,
    "IsBorrowAllowed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("ResourceKey")
);

-- CreateTable
CREATE TABLE "ItemUnit" (
    "ItemUnitKey" SERIAL NOT NULL,
    "ResourceKey" INTEGER NOT NULL,
    "ItemKey" INTEGER NOT NULL,
    "ItemID" VARCHAR(256) NOT NULL,
    "IsDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ItemUnit_pkey" PRIMARY KEY ("ItemUnitKey")
);

-- CreateTable
CREATE TABLE "Item" (
    "ItemKey" SERIAL NOT NULL,
    "ItemName" VARCHAR(256),
    "ItemDesc" TEXT,
    "CreditWeight" DOUBLE PRECISION NOT NULL,
    "IsDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("ItemKey")
);

-- CreateTable
CREATE TABLE "Room" (
    "RoomKey" SERIAL NOT NULL,
    "ResourceKey" INTEGER NOT NULL,
    "RoomName" VARCHAR(256),
    "RoomLocation" VARCHAR(256),
    "CreditWeight" DOUBLE PRECISION NOT NULL,
    "IsDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("RoomKey")
);

-- CreateTable
CREATE TABLE "Condition" (
    "ConditionKey" SERIAL NOT NULL,
    "ResourceKey" INTEGER NOT NULL,
    "AccountKey_Checkedby" INTEGER NOT NULL,
    "ConditionStatus" "ConditionStatus" NOT NULL,
    "Notes" TEXT,
    "CheckedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Condition_pkey" PRIMARY KEY ("ConditionKey")
);

-- CreateTable
CREATE TABLE "BorrowRule" (
    "BorrowRuleKey" SERIAL NOT NULL,
    "RuleName" VARCHAR(256),

    CONSTRAINT "BorrowRule_pkey" PRIMARY KEY ("BorrowRuleKey")
);

-- CreateTable
CREATE TABLE "BorrowConstraint" (
    "BorrowConstraintKey" SERIAL NOT NULL,
    "BorrowRuleKey" INTEGER NOT NULL,
    "CreditTierKey" INTEGER NOT NULL,
    "MinimumAuthorityLevel" INTEGER,
    "MaxBorrowDate" INTEGER NOT NULL,
    "MaxExtendTime" INTEGER NOT NULL,

    CONSTRAINT "BorrowConstraint_pkey" PRIMARY KEY ("BorrowConstraintKey")
);

-- CreateTable
CREATE TABLE "PenaltyRule" (
    "PenaltyRuleKey" SERIAL NOT NULL,
    "BorrowRuleKey" INTEGER NOT NULL,
    "CreditDeducted" INTEGER NOT NULL,
    "PenaltyTimeLength" INTEGER NOT NULL,
    "PenaltyReason" "PenaltyReason" NOT NULL,

    CONSTRAINT "PenaltyRule_pkey" PRIMARY KEY ("PenaltyRuleKey")
);

-- CreateTable
CREATE TABLE "Eligibility" (
    "EligibilityKey" SERIAL NOT NULL,
    "ResourceKey" INTEGER NOT NULL,
    "ManageGroupKey" INTEGER NOT NULL,
    "AuthorityRoleKey" INTEGER NOT NULL,

    CONSTRAINT "Eligibility_pkey" PRIMARY KEY ("EligibilityKey")
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
CREATE TABLE "Reservation" (
    "ReservationKey" SERIAL NOT NULL,
    "ResourceKey" INTEGER NOT NULL,
    "AccountKey_Reservedby" INTEGER NOT NULL,
    "Reason" VARCHAR(256),
    "StartTime" TIMESTAMP(3) NOT NULL,
    "EndTime" TIMESTAMP(3) NOT NULL,
    "ActionTime" TIMESTAMP(3) NOT NULL,
    "ApproveStatus" "ApproveStatus" NOT NULL,
    "AccountKey_Approvedby" INTEGER,
    "ReservationExpiration" TIMESTAMP(3) NOT NULL,
    "ResolvedAt" TIMESTAMP(3),

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("ReservationKey")
);

-- CreateTable
CREATE TABLE "Usage" (
    "UsageKey" SERIAL NOT NULL,
    "ReservationKey" INTEGER,
    "AccountKey_Usedby" INTEGER NOT NULL,
    "ResourceKey" INTEGER NOT NULL,
    "CurrentStatus" "CurrentStatus" NOT NULL,
    "DueTime" TIMESTAMP(3) NOT NULL,
    "ExtensionRequestKey_Pending" INTEGER,
    "CheckoutTime" TIMESTAMP(3) NOT NULL,
    "CheckInTime" TIMESTAMP(3),
    "ConditionKey_Checkout" INTEGER NOT NULL,
    "ConditionKey_CheckIn" INTEGER,

    CONSTRAINT "Usage_pkey" PRIMARY KEY ("UsageKey")
);

-- CreateTable
CREATE TABLE "ExtensionRequest" (
    "ExtensionRequestKey" SERIAL NOT NULL,
    "UsageKey" INTEGER NOT NULL,
    "AccountKey_Requestedby" INTEGER NOT NULL,
    "ExtendNo" INTEGER,
    "PreviousDueTime" TIMESTAMP(3) NOT NULL,
    "RequestedDueTime" TIMESTAMP(3) NOT NULL,
    "RequestedAt" TIMESTAMP(3) NOT NULL,
    "ApproveStatus" "ApproveStatus" NOT NULL,
    "AccountKey_Approvedby" INTEGER,
    "ResolvedAt" TIMESTAMP(3),

    CONSTRAINT "ExtensionRequest_pkey" PRIMARY KEY ("ExtensionRequestKey")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "InspectionKey" SERIAL NOT NULL,
    "UsageKey" INTEGER NOT NULL,
    "ResourceKey" INTEGER NOT NULL,
    "AccountKey_Inspectedby" INTEGER NOT NULL,
    "ConditionKey" INTEGER NOT NULL,
    "Verdict" "Verdict" NOT NULL,
    "AppealKey" INTEGER,
    "PenaltyKey" INTEGER,
    "ActionTime" TIMESTAMP(3) NOT NULL,
    "Notes" TEXT,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("InspectionKey")
);

-- CreateTable
CREATE TABLE "Penalty" (
    "PenaltyKey" SERIAL NOT NULL,
    "AccountKey" INTEGER NOT NULL,
    "UsageKey" INTEGER,
    "Reason" TEXT,
    "CreditDeducted" INTEGER NOT NULL DEFAULT 0,
    "ActionTime" TIMESTAMP(3) NOT NULL,
    "ExpirationDate" TIMESTAMP(3) NOT NULL,
    "PenaltyStatus" "PenaltyStatus" NOT NULL DEFAULT 'Ended',
    "AppealKey" INTEGER,
    "IsDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Penalty_pkey" PRIMARY KEY ("PenaltyKey")
);

-- CreateTable
CREATE TABLE "Appeal" (
    "AppealKey" SERIAL NOT NULL,
    "PenaltyKey_Original" INTEGER NOT NULL,
    "PenaltyKey_New" INTEGER,
    "AccountKey_Filedby" INTEGER NOT NULL,
    "ActionTime" TIMESTAMP(3),
    "AccountKey_Resolvedby" INTEGER,
    "AppealReason" TEXT,
    "ApproveStatus" "ApproveStatus" NOT NULL,
    "ResolvedAt" TIMESTAMP(3),

    CONSTRAINT "Appeal_pkey" PRIMARY KEY ("AppealKey")
);

-- CreateTable
CREATE TABLE "Image" (
    "ImageKey" SERIAL NOT NULL,
    "AccountKey_Submittedby" INTEGER NOT NULL,
    "UsageKey" INTEGER NOT NULL,
    "ResourceKey" INTEGER NOT NULL,
    "InspectionKey" INTEGER,
    "ImageURL" VARCHAR(256) NOT NULL,
    "SubmissionType" "SubmissionType" NOT NULL,
    "ActionTime" TIMESTAMP(3) NOT NULL,
    "IsDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("ImageKey")
);

-- CreateTable
CREATE TABLE "Notification" (
    "NotificationKey" SERIAL NOT NULL,
    "AccountKey" INTEGER NOT NULL,
    "NotificationType" "NotificationType" NOT NULL,
    "NotificationContent" TEXT NOT NULL,
    "SentTime" TIMESTAMP(3) NOT NULL,
    "IsRead" BOOLEAN NOT NULL DEFAULT false,
    "IsDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("NotificationKey")
);

-- CreateTable
CREATE TABLE "Repair" (
    "RepairKey" SERIAL NOT NULL,
    "ReservationKey" INTEGER,
    "AccountKey_Repairedby" INTEGER NOT NULL,
    "ResourceKey" INTEGER NOT NULL,
    "BeginRepairDate" TIMESTAMP(3) NOT NULL,
    "EndRepairDate" TIMESTAMP(3),
    "ConditionKey_BeforeRepair" INTEGER NOT NULL,
    "ConditionKey_AfterRepair" INTEGER,

    CONSTRAINT "Repair_pkey" PRIMARY KEY ("RepairKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "Branch_ManageGroupKey_key" ON "Branch"("ManageGroupKey");

-- CreateIndex
CREATE UNIQUE INDEX "Club_ManageGroupKey_key" ON "Club"("ManageGroupKey");

-- CreateIndex
CREATE UNIQUE INDEX "Authority_AccountKey_ManageGroupKey_key" ON "Authority"("AccountKey", "ManageGroupKey");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_ConditionKey_key" ON "Resource"("ConditionKey");

-- CreateIndex
CREATE UNIQUE INDEX "ItemUnit_ResourceKey_key" ON "ItemUnit"("ResourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "Room_ResourceKey_key" ON "Room"("ResourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "BorrowConstraint_BorrowRuleKey_CreditTierKey_key" ON "BorrowConstraint"("BorrowRuleKey", "CreditTierKey");

-- CreateIndex
CREATE UNIQUE INDEX "PenaltyRule_BorrowRuleKey_PenaltyReason_key" ON "PenaltyRule"("BorrowRuleKey", "PenaltyReason");

-- CreateIndex
CREATE UNIQUE INDEX "Eligibility_ManageGroupKey_ResourceKey_AuthorityRoleKey_key" ON "Eligibility"("ManageGroupKey", "ResourceKey", "AuthorityRoleKey");

-- CreateIndex
CREATE UNIQUE INDEX "Usage_ExtensionRequestKey_Pending_key" ON "Usage"("ExtensionRequestKey_Pending");

-- CreateIndex
CREATE UNIQUE INDEX "Appeal_PenaltyKey_Original_key" ON "Appeal"("PenaltyKey_Original");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_ManageGroupKey_fkey" FOREIGN KEY ("ManageGroupKey") REFERENCES "ManagementGroup"("ManageGroupKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_FacultyKey_fkey" FOREIGN KEY ("FacultyKey") REFERENCES "Faculty"("FacultyKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Club" ADD CONSTRAINT "Club_ManageGroupKey_fkey" FOREIGN KEY ("ManageGroupKey") REFERENCES "ManagementGroup"("ManageGroupKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authority" ADD CONSTRAINT "Authority_AccountKey_fkey" FOREIGN KEY ("AccountKey") REFERENCES "Account"("AccountKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authority" ADD CONSTRAINT "Authority_ManageGroupKey_fkey" FOREIGN KEY ("ManageGroupKey") REFERENCES "ManagementGroup"("ManageGroupKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authority" ADD CONSTRAINT "Authority_AuthorityRoleKey_fkey" FOREIGN KEY ("AuthorityRoleKey") REFERENCES "AuthorityRole"("AuthorityRoleKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_ManageGroupKey_fkey" FOREIGN KEY ("ManageGroupKey") REFERENCES "ManagementGroup"("ManageGroupKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_BorrowRuleKey_fkey" FOREIGN KEY ("BorrowRuleKey") REFERENCES "BorrowRule"("BorrowRuleKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_ConditionKey_fkey" FOREIGN KEY ("ConditionKey") REFERENCES "Condition"("ConditionKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemUnit" ADD CONSTRAINT "ItemUnit_ResourceKey_fkey" FOREIGN KEY ("ResourceKey") REFERENCES "Resource"("ResourceKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemUnit" ADD CONSTRAINT "ItemUnit_ItemKey_fkey" FOREIGN KEY ("ItemKey") REFERENCES "Item"("ItemKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_ResourceKey_fkey" FOREIGN KEY ("ResourceKey") REFERENCES "Resource"("ResourceKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Condition" ADD CONSTRAINT "Condition_ResourceKey_fkey" FOREIGN KEY ("ResourceKey") REFERENCES "Resource"("ResourceKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Condition" ADD CONSTRAINT "Condition_AccountKey_Checkedby_fkey" FOREIGN KEY ("AccountKey_Checkedby") REFERENCES "Account"("AccountKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowConstraint" ADD CONSTRAINT "BorrowConstraint_BorrowRuleKey_fkey" FOREIGN KEY ("BorrowRuleKey") REFERENCES "BorrowRule"("BorrowRuleKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowConstraint" ADD CONSTRAINT "BorrowConstraint_CreditTierKey_fkey" FOREIGN KEY ("CreditTierKey") REFERENCES "CreditTier"("CreditTierKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenaltyRule" ADD CONSTRAINT "PenaltyRule_BorrowRuleKey_fkey" FOREIGN KEY ("BorrowRuleKey") REFERENCES "BorrowRule"("BorrowRuleKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Eligibility" ADD CONSTRAINT "Eligibility_ResourceKey_fkey" FOREIGN KEY ("ResourceKey") REFERENCES "Resource"("ResourceKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Eligibility" ADD CONSTRAINT "Eligibility_ManageGroupKey_fkey" FOREIGN KEY ("ManageGroupKey") REFERENCES "ManagementGroup"("ManageGroupKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Eligibility" ADD CONSTRAINT "Eligibility_AuthorityRoleKey_fkey" FOREIGN KEY ("AuthorityRoleKey") REFERENCES "AuthorityRole"("AuthorityRoleKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_ResourceKey_fkey" FOREIGN KEY ("ResourceKey") REFERENCES "Resource"("ResourceKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_AccountKey_Reservedby_fkey" FOREIGN KEY ("AccountKey_Reservedby") REFERENCES "Account"("AccountKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_AccountKey_Approvedby_fkey" FOREIGN KEY ("AccountKey_Approvedby") REFERENCES "Account"("AccountKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usage" ADD CONSTRAINT "Usage_ReservationKey_fkey" FOREIGN KEY ("ReservationKey") REFERENCES "Reservation"("ReservationKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usage" ADD CONSTRAINT "Usage_AccountKey_Usedby_fkey" FOREIGN KEY ("AccountKey_Usedby") REFERENCES "Account"("AccountKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usage" ADD CONSTRAINT "Usage_ResourceKey_fkey" FOREIGN KEY ("ResourceKey") REFERENCES "Resource"("ResourceKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usage" ADD CONSTRAINT "Usage_ExtensionRequestKey_Pending_fkey" FOREIGN KEY ("ExtensionRequestKey_Pending") REFERENCES "ExtensionRequest"("ExtensionRequestKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usage" ADD CONSTRAINT "Usage_ConditionKey_Checkout_fkey" FOREIGN KEY ("ConditionKey_Checkout") REFERENCES "Condition"("ConditionKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usage" ADD CONSTRAINT "Usage_ConditionKey_CheckIn_fkey" FOREIGN KEY ("ConditionKey_CheckIn") REFERENCES "Condition"("ConditionKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtensionRequest" ADD CONSTRAINT "ExtensionRequest_UsageKey_fkey" FOREIGN KEY ("UsageKey") REFERENCES "Usage"("UsageKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtensionRequest" ADD CONSTRAINT "ExtensionRequest_AccountKey_Requestedby_fkey" FOREIGN KEY ("AccountKey_Requestedby") REFERENCES "Account"("AccountKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtensionRequest" ADD CONSTRAINT "ExtensionRequest_AccountKey_Approvedby_fkey" FOREIGN KEY ("AccountKey_Approvedby") REFERENCES "Account"("AccountKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_UsageKey_fkey" FOREIGN KEY ("UsageKey") REFERENCES "Usage"("UsageKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_ResourceKey_fkey" FOREIGN KEY ("ResourceKey") REFERENCES "Resource"("ResourceKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_AccountKey_Inspectedby_fkey" FOREIGN KEY ("AccountKey_Inspectedby") REFERENCES "Account"("AccountKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_ConditionKey_fkey" FOREIGN KEY ("ConditionKey") REFERENCES "Condition"("ConditionKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Penalty" ADD CONSTRAINT "Penalty_AccountKey_fkey" FOREIGN KEY ("AccountKey") REFERENCES "Account"("AccountKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Penalty" ADD CONSTRAINT "Penalty_UsageKey_fkey" FOREIGN KEY ("UsageKey") REFERENCES "Usage"("UsageKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Penalty" ADD CONSTRAINT "Penalty_AppealKey_fkey" FOREIGN KEY ("AppealKey") REFERENCES "Appeal"("AppealKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_PenaltyKey_Original_fkey" FOREIGN KEY ("PenaltyKey_Original") REFERENCES "Penalty"("PenaltyKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_PenaltyKey_New_fkey" FOREIGN KEY ("PenaltyKey_New") REFERENCES "Penalty"("PenaltyKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_AccountKey_Filedby_fkey" FOREIGN KEY ("AccountKey_Filedby") REFERENCES "Account"("AccountKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_AccountKey_Resolvedby_fkey" FOREIGN KEY ("AccountKey_Resolvedby") REFERENCES "Account"("AccountKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_AccountKey_Submittedby_fkey" FOREIGN KEY ("AccountKey_Submittedby") REFERENCES "Account"("AccountKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_UsageKey_fkey" FOREIGN KEY ("UsageKey") REFERENCES "Usage"("UsageKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_ResourceKey_fkey" FOREIGN KEY ("ResourceKey") REFERENCES "Resource"("ResourceKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_InspectionKey_fkey" FOREIGN KEY ("InspectionKey") REFERENCES "Inspection"("InspectionKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_AccountKey_fkey" FOREIGN KEY ("AccountKey") REFERENCES "Account"("AccountKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_ReservationKey_fkey" FOREIGN KEY ("ReservationKey") REFERENCES "Reservation"("ReservationKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_AccountKey_Repairedby_fkey" FOREIGN KEY ("AccountKey_Repairedby") REFERENCES "Account"("AccountKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_ResourceKey_fkey" FOREIGN KEY ("ResourceKey") REFERENCES "Resource"("ResourceKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_ConditionKey_BeforeRepair_fkey" FOREIGN KEY ("ConditionKey_BeforeRepair") REFERENCES "Condition"("ConditionKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_ConditionKey_AfterRepair_fkey" FOREIGN KEY ("ConditionKey_AfterRepair") REFERENCES "Condition"("ConditionKey") ON DELETE SET NULL ON UPDATE CASCADE;
