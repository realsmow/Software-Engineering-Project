-- English twins of the notification text. Existing rows stay NULL and show Thai.
ALTER TABLE "Notification" ADD COLUMN "TitleEn" TEXT,
ADD COLUMN "BodyEn" TEXT;
