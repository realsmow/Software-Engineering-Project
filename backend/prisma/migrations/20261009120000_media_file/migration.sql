-- Photo bytes move from the server disk into the database (#6).
CREATE TABLE "MediaFile" (
    "Key" TEXT NOT NULL,
    "ContentType" TEXT NOT NULL,
    "Bytes" BYTEA NOT NULL,
    "CreatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaFile_pkey" PRIMARY KEY ("Key")
);
