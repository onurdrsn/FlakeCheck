import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

export function createDatabase(connectionString: string) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  return drizzle(neon(connectionString));
}
