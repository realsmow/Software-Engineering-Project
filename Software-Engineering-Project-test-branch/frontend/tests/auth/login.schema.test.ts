import { describe, expect, it } from 'vitest';
import { kuLoginSchema } from '../../src/features/auth/login.schema';

const validPassword = 'password123';

function loginInput(email: string) {
  return { email, password: validPassword };
}

describe('kuLoginSchema', () => {
  it.each(['student@ku.ac.th', 'student@ku.th'])(
    'accepts a KU email address: %s',
    (email) => {
      expect(kuLoginSchema.safeParse(loginInput(email)).success).toBe(true);
    },
  );

  it.each(['student@gmail.com', 'student@example.com'])(
    'rejects a non-KU email address: %s',
    (email) => {
      expect(kuLoginSchema.safeParse(loginInput(email)).success).toBe(false);
    },
  );
});
