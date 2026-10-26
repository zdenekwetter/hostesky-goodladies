import { NextResponse } from 'next/server';
import { AuthError } from './auth';

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/** Obal pro API routy – převede chyby na srozumitelné odpovědi. */
export function handle<A extends unknown[]>(fn: (...a: A) => Promise<Response>) {
  return async (...a: A): Promise<Response> => {
    try {
      return await fn(...a);
    } catch (e) {
      if (e instanceof AuthError) return json({ error: e.message }, e.status);
      const pgErr = e as { code?: string; message?: string };
      if (pgErr.code === '23514' || pgErr.code === 'P0001') {
        // porušení pravidla v databázi (např. publikace bez souhlasu) – zpráva je pro člověka
        return json({ error: pgErr.message }, 422);
      }
      console.error(e);
      return json({ error: 'Něco se pokazilo. Zkuste to prosím znovu.' }, 500);
    }
  };
}
