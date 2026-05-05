import { createConnection } from 'mysql2/promise';

const DB_URL = 'mysql://26DHJ7rSPxQWQYz.5e340f0e655e:0N6vPtBvCm137PIix2vl@gateway05.us-east-1.prod.aws.tidbcloud.com:4000/ExcMToduGVqDRtQnvUsVkJ?ssl={"rejectUnauthorized":true}';

const conn = await createConnection(DB_URL);
const sqls = [
  "ALTER TABLE loan_applications ADD COLUMN termValue int",
  "ALTER TABLE loan_applications ADD COLUMN termUnit varchar(10) DEFAULT 'months'",
  "ALTER TABLE loan_applications ADD COLUMN termNotes text"
];
for (const sql of sqls) {
  try {
    await conn.execute(sql);
    console.log('OK:', sql.slice(0, 70));
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('Already exists:', sql.slice(0, 70));
    } else {
      console.error('ERR:', e.message);
    }
  }
}
await conn.end();
console.log('Done.');
