-- Rename TroubleshootingEvent.deviceKey to subjectKey.
--
-- Subjects now cover applications (OneDrive, SAP, ESS) as well as devices,
-- so "deviceKey" was no longer true of half the rows it would hold. Renamed
-- rather than left alone because the column is read by the settings card and
-- a misleading name there outlives anyone's memory of why.
--
-- Safe as a plain rename: the table was introduced in the previous migration
-- and holds no production rows.
ALTER TABLE "TroubleshootingEvent" RENAME COLUMN "deviceKey" TO "subjectKey";
