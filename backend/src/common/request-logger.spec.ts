import { loggablePath } from './request-logger';

// #180: logs must not keep query input, OAuth codes or upload tickets.
describe('loggablePath', () => {
  it.each([
    [
      '/trpc/admin.listUsers?batch=1&input=%7B%22q%22%3A%22b6610%22%7D',
      '/trpc/admin.listUsers',
    ],
    ['/auth/google/callback?code=secret&state=x', '/auth/google/callback'],
    ['/uploads/eyJhbGciOi.signed.ticket', '/uploads/:token'],
    ['/media/photo.png', '/media/photo.png'],
  ])('%s -> %s', (url, expected) => {
    expect(loggablePath(url)).toBe(expected);
  });
});
