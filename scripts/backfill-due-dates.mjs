// Backfill dueDate for existing loan repayments
import { createConnection } from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await createConnection(process.env.DATABASE_URL);

// Get all repayments without dueDate
const [reps] = await conn.query("SELECT * FROM loan_repayments WHERE dueDate IS NULL ORDER BY loanId, createdAt");
console.log("Repayments without dueDate:", reps.length);

for (const rep of reps) {
  // Get the loan
  const [[loan]] = await conn.query("SELECT * FROM loan_applications WHERE id = ?", [rep.loanId]);
  if (!loan) continue;

  // Count position of this repayment among all repayments for this loan
  const [allReps] = await conn.query(
    "SELECT id, createdAt FROM loan_repayments WHERE loanId = ? ORDER BY createdAt ASC",
    [rep.loanId]
  );
  const idx = allReps.findIndex(r => r.id === rep.id);
  const instalmentNumber = idx + 1;

  const baseDate = loan.trusteeApprovedAt
    ? new Date(loan.trusteeApprovedAt)
    : new Date(loan.createdAt);
  const dueDate = new Date(baseDate);
  dueDate.setMonth(dueDate.getMonth() + instalmentNumber);

  await conn.query("UPDATE loan_repayments SET dueDate = ? WHERE id = ?", [dueDate, rep.id]);
  console.log(`Updated repayment ${rep.id} (loan ${rep.loanId}, instalment ${instalmentNumber}) => dueDate: ${dueDate.toISOString().split("T")[0]}`);
}

console.log("Done");
await conn.end();
