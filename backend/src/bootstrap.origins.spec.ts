import { allowedOrigins } from './bootstrap';

describe('allowedOrigins', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('adds CORS_ORIGINS to the dev servers outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.CORS_ORIGINS = 'https://ulms.ku.ac.th';
    expect(allowedOrigins()).toEqual([
      'http://localhost:5173',
      'http://localhost:4173',
      'https://ulms.ku.ac.th',
    ]);
  });

  it('uses only CORS_ORIGINS in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS =
      'https://ulms.ku.ac.th, https://www.ulms.ku.ac.th';
    expect(allowedOrigins()).toEqual([
      'https://ulms.ku.ac.th',
      'https://www.ulms.ku.ac.th',
    ]);
  });

  it('refuses to start production without it', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ORIGINS;
    expect(() => allowedOrigins()).toThrow(/CORS_ORIGINS/);
  });
});
