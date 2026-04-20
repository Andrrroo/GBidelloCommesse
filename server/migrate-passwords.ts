/**
 * Script one-shot per migrare le password da plain text a bcrypt hash.
 * Eseguire una sola volta: npx tsx server/migrate-passwords.ts
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersPath = path.join(__dirname, '..', 'data', 'users.json');
const BCRYPT_ROUNDS = 10;

async function migrate() {
  const content = await fs.readFile(usersPath, 'utf-8');
  const users = JSON.parse(content);

  let migrated = 0;

  for (const user of users) {
    // Se la password non inizia con $2a$ o $2b$, e' in chiaro
    if (!user.password.startsWith('$2a$') && !user.password.startsWith('$2b$')) {
      const hashed = await bcrypt.hash(user.password, BCRYPT_ROUNDS);
      user.password = hashed;
      migrated++;
      console.log(`Migrata password per utente: ${user.username}`);
    } else {
      console.log(`Password gia' hashata per utente: ${user.username} - saltato`);
    }
  }

  await fs.writeFile(usersPath, JSON.stringify(users, null, 2), 'utf-8');
  console.log(`\nMigrazione completata: ${migrated} password aggiornate su ${users.length} utenti.`);
}

migrate().catch(err => {
  console.error('Errore durante la migrazione:', err);
  process.exit(1);
});
