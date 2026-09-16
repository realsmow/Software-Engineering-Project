import { describe, expect, it } from 'vitest';
import {
  kuLoginSchema,
  localLoginSchema,
} from '../../src/features/auth/login.schema';

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

  it('reports Thai required errors for empty email and password fields', () => {
    const result = kuLoginSchema.safeParse({ email: '', password: '' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain('กรุณากรอกอีเมล KU');
      expect(messages).toContain('กรุณากรอกรหัสผ่าน');
    }
  });
});

describe('localLoginSchema', () => {
  it('reports Thai required errors for empty username and password fields', () => {
    const result = localLoginSchema.safeParse({ username: '', password: '' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain('กรุณากรอกชื่อผู้ใช้');
      expect(messages).toContain('กรุณากรอกรหัสผ่าน');
    }
  });
});
