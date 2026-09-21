# Frontend-hosted images

Pictures shipped with the app: catalogue photos, room shots, anything curated
by the team rather than uploaded by a user.

Vite serves `public/` at the site root, so a file saved as

    public/images/items/oscilloscope.png

is reachable at `/images/items/oscilloscope.png`, and that is the exact string
to store in the database (`ItemInfo.ImageURL`, `RoomInfo.ImageURL`).

## Two prefixes, on purpose

| Prefix     | Served by | Holds                                        |
|------------|-----------|----------------------------------------------|
| `/images/` | frontend  | curated artwork committed to this repo        |
| `/media/`  | backend   | files users upload at runtime (`MEDIA_ROOT`)  |

They cannot be merged. `/media/` is written at runtime by `image.requestUpload`
and is gitignored, so those files do not survive a fresh clone; `/images/` is
committed and always present. One prefix cannot be served by two origins.

The backend accepts both forms. See `isSafeImageUrl` in
`backend/src/common/schemas/image.schema.ts` - anything that is neither a path
under those two prefixes nor an absolute http(s) URL is refused, because
`ImageURL` ends up in an `<img src>` and a column that accepts any string is
stored XSS.

## Notes

- Keep files small. They are committed, so every byte is in the repo forever.
- A missing or broken file falls back to the placeholder icon rather than a
  torn-image glyph, so a wrong path degrades quietly. Check the path if a
  picture does not appear.
