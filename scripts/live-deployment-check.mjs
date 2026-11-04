import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'index.html'), 'utf8');
const version = source.match(/<title>[^<]*\s(v\d+\.\d+\.\d+)<\/title>/)?.[1];
if (!version) throw Error('Cannot determine expected application version');

// GitHub Pages uses the repository owner's current username as its subdomain.
// Resolve this at run time so account renames don't break release checks.
const repository = process.env.GITHUB_REPOSITORY || 'Foreignsauceman/Marketlabs';
const [owner, project] = repository.split('/');
if (!owner || !project) throw Error('Invalid GITHUB_REPOSITORY: ' + repository);
const site = new URL(process.env.MARKETLAB_URL || `https://${owner.toLowerCase()}.github.io/${project}/`);
const sleep = duration => new Promise(resolve => setTimeout(resolve, duration));

async function request(relativePath) {
  const url = new URL(relativePath, site);
  url.searchParams.set('smoke-version', version);
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw Error(relativePath + ' returned HTTP ' + response.status);
  return response;
}

async function verify() {
  const home = await (await request('./')).text();
  if (!home.includes('The Simulated Exchange ' + version + '</title>')) {
    throw Error('GitHub Pages is still serving an older application version');
  }
  const sw = await (await request('./sw.js')).text();
  if (!sw.includes("const CACHE='marketlab-shell-" + version + "'")) {
    throw Error('Published service worker cache version mismatch');
  }
  const manifest = await (await request('./manifest.webmanifest')).json();
  if (manifest.start_url !== './' || manifest.scope !== './' || manifest.display !== 'standalone') {
    throw Error('Published PWA manifest is invalid');
  }
  if (!manifest.icons.some(icon => icon.purpose === 'maskable')) {
    throw Error('Published manifest has no maskable icon');
  }
  for (const icon of [...manifest.icons, { src: './icons/apple-touch-icon.png', sizes: '180x180' }]) {
    const bytes = new Uint8Array(await (await request(icon.src)).arrayBuffer());
    const signature = [137,80,78,71,13,10,26,10];
    if (!signature.every((v, i) => bytes[i] === v)) throw Error(icon.src + ' is not a PNG');
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    const expected = Number(icon.sizes.split('x')[0]);
    if (view.getUint32(16) !== expected || view.getUint32(20) !== expected) {
      throw Error(icon.src + ' has unexpected dimensions');
    }
  }
}

let lastError;
for (let attempt = 1; attempt <= 24; attempt++) {
  try {
    await verify();
    console.log('Live GitHub Pages smoke test passed: ' + site.href + ' (' + version + ')');
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.log('Publish check ' + attempt + '/24: ' + error.message);
    if (attempt !== 24) await sleep(10000);
  }
}
throw Error('Live deployment verification failed for ' + version + ': ' + lastError.message);
