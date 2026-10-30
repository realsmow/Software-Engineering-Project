/**
 * Which database the scripts work on.
 *
 * Asked for at the prompt (hidden, so the password stays off the screen and
 * out of shell history) rather than read from DATABASE_URL: backend/.env
 * always sets that to the local database, so a forgotten variable would
 * silently hit the wrong one. Enter on its own keeps the local one.
 *
 * Render refuses connections without SSL ("User was denied access"); psql
 * turns SSL on by itself, the Node driver does not, so it is added for any
 * database that is not local.
 */
export async function chooseDatabase(): Promise<string> {
  const pasted = (
    await askHidden('Paste the database URL (Enter alone = local .env): ')
  ).trim();
  if (pasted) process.env.DATABASE_URL = pasted;
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('No database URL given and none in .env.');

  const url = new URL(raw);
  const local = ['localhost', '127.0.0.1', '::1', '[::1]', 'postgres', 'db'];
  if (!local.includes(url.hostname) && !url.searchParams.has('sslmode')) {
    url.searchParams.set('sslmode', 'require');
    process.env.DATABASE_URL = url.toString();
  }
  return url.hostname;
}

const ESC = String.fromCharCode(27);

/** One line from the terminal without echoing it; piped input is read as is. */
function askHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  process.stdout.write(question);
  if (!stdin.isTTY) {
    return new Promise((resolve) => {
      let text = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (chunk: string) => (text += chunk));
      stdin.on('end', () => resolve(text.split('\n')[0] ?? ''));
    });
  }
  return new Promise((resolve, reject) => {
    let text = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk: string) => {
      // Terminals wrap a paste in these markers; they are not part of the URL.
      const clean = chunk
        .split(`${ESC}[200~`)
        .join('')
        .split(`${ESC}[201~`)
        .join('');
      for (const ch of clean) {
        if (ch === '\r' || ch === '\n') {
          finish();
          resolve(text);
          return;
        }
        if (ch === '\x03') {
          finish();
          reject(new Error('Cancelled.'));
          return;
        }
        if (ch === '\x7f') text = text.slice(0, -1);
        else text += ch;
      }
    };
    const finish = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
    };
    stdin.on('data', onData);
  });
}
