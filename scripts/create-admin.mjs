// Založí nebo aktualizuje účet do administrace z příkazové řádky.
// Běžně se to nedělá: první účet se zakládá v prohlížeči (/admin/login), další v záložce Tým.
// Použití:
//   DATABASE_URL=… npm run create-admin -- zuzana.pribylova@goodladies.cz "Zuzana Přibylová" approver
// Heslo se zadá interaktivně (nebo proměnnou ADMIN_PASSWORD). Role: editor | approver.

import pg from 'pg';
import bcrypt from 'bcryptjs';
import readline from 'node:readline/promises';

const [email, name, role = 'editor'] = process.argv.slice(2);
if (!email || !name || !['editor', 'approver'].includes(role)) {
  console.error('Použití: npm run create-admin -- <email> "<Jméno>" <editor|approver>');
  process.exit(1);
}
const domain = process.env.ADMIN_EMAIL_DOMAIN || 'goodladies.cz';
if (!email.toLowerCase().endsWith(`@${domain}`) && !process.env.ALLOW_ANY_DOMAIN) {
  console.error(`Účty jen pro doménu @${domain} (výjimka: ALLOW_ANY_DOMAIN=1).`);
  process.exit(1);
}

let password = process.env.ADMIN_PASSWORD;
if (!password) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question('Heslo (min. 10 znaků): ');
  rl.close();
}
if (!password || password.length < 10) {
  console.error('Heslo musí mít aspoň 10 znaků.');
  process.exit(1);
}

const url = process.env.DATABASE_URL_OWNER || process.env.DATABASE_URL;
const client = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: true } });
await client.connect();
const hash = await bcrypt.hash(password, 12);
await client.query(
  `INSERT INTO admin_user (email, name, password_hash, role) VALUES (lower($1), $2, $3, $4)
   ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash,
     role = EXCLUDED.role, active = true`,
  [email, name, hash, role]);
await client.end();
console.log(`Účet ${email} (${role}) je připravený.`);
