-- #205: photographs of the condition check a supervisor-routed extension needs.
--
-- The supervisor granting a T2 extension never has the unit in front of them,
-- so the only thing they can judge it by is what staff recorded. Until now the
-- check could record a grade and a note and nothing else, and the photos on the
-- approval screen were the loan's own - keyed on UsageKey, so in practice the
-- picture taken when the borrower collected the item weeks earlier.
--
-- Its own SubmissionType and its own key, rather than reusing InspectionPicture
-- against the loan: one loan can be extended several times, each check is a
-- separate observation of the same unit, and the before/after/inspection set of
-- the original loan is evidence in its own right that an extension must not be
-- able to add to.
ALTER TYPE "SubmissionType" ADD VALUE 'ExtensionCheckPicture';

ALTER TABLE "Images" ADD COLUMN "ExtensionKey" INTEGER;

ALTER TABLE "Images" ADD CONSTRAINT "Images_ExtensionKey_fkey" FOREIGN KEY ("ExtensionKey") REFERENCES "ExtensionRequest"("ExtensionKey") ON DELETE CASCADE ON UPDATE CASCADE;

-- The approval screen reads "the photos of this extension's check" on every
-- open row; without this it is a scan of every photo in the system.
CREATE INDEX "Images_ExtensionKey_idx" ON "Images"("ExtensionKey");
