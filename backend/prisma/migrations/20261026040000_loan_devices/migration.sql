-- AlterTable
ALTER TABLE "Loan" ADD COLUMN "deviceOptionId" TEXT;
ALTER TABLE "Loan" ADD COLUMN "requestedAccessoryId" INTEGER;

-- The single loan category is replaced by the loan_devices whitelist, which
-- starts empty: an admin chooses the loanable records in Settings → Loans.
DELETE FROM "Setting" WHERE "key" = 'loan_category_id';
