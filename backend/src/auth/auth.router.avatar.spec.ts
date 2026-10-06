import { AuthRouter } from './auth.router';

// #135: a profile picture may only point at one of our own avatar uploads.
describe('AuthRouter.setAvatar', () => {
  function build() {
    const setAvatar = jest.fn().mockResolvedValue(undefined);
    const router = new AuthRouter(
      {
        setAvatar,
        getProfile: jest.fn().mockResolvedValue({ avatarUrl: null }),
      } as never,
      { methodOf: jest.fn().mockResolvedValue('password') } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        toStoredUrl: (v: string) => v.replace('http://api.test', ''),
        toPublicUrl: (v: string | null) => v,
      } as never,
    );
    const ctx = { user: { accountKey: 7 }, req: {} } as never;
    return { router, setAvatar, ctx };
  }

  it.each([
    '/media/itemType/x.png',
    'https://evil.test/x.png',
    '/media/inspection/x.png',
  ])('refuses %s', async (imageUrl) => {
    const { router, setAvatar, ctx } = build();
    await expect(router.setAvatar({ imageUrl }, ctx)).rejects.toMatchObject({
      businessCode: 'AVATAR_URL_INVALID',
    });
    expect(setAvatar).not.toHaveBeenCalled();
  });

  it('stores an avatar upload, given absolute or relative, and clears with null', async () => {
    const { router, setAvatar, ctx } = build();
    await router.setAvatar(
      { imageUrl: 'http://api.test/media/avatar/a.png' },
      ctx,
    );
    expect(setAvatar).toHaveBeenLastCalledWith(7, '/media/avatar/a.png');
    await router.setAvatar({ imageUrl: null }, ctx);
    expect(setAvatar).toHaveBeenLastCalledWith(7, null);
  });
});
