import { mkdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export const projectFiles = ['package.json', 'package-lock.json', 'chef.config.ts', 'chef.generated.ts', 'projection.ts', 'schema.graphql', 'bounded-prep-client.mjs'];
export async function stageContext(source, destination) {
  // A fresh destination prevents stale files, symlinks and private material surviving staging.
  await mkdir(destination);
  const files = {};
  for (const name of projectFiles) {
    const path = resolve(source, name);
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw Error('PROJECT_FILE_REQUIRED');
    const bytes = await readFile(path);
    await writeFile(resolve(destination, name), bytes, { flag: 'wx' });
    files[name] = createHash('sha256').update(bytes).digest('hex');
  }
  await writeFile(resolve(destination, 'source-hashes.json'), JSON.stringify({ files }, null, 2) + '\n', { flag: 'wx' });
  return files;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 2) throw Error('NO_ARGUMENTS_ALLOWED');
  const here = dirname(fileURLToPath(import.meta.url));
  await stageContext(resolve(here, '../../indexers/zeer'), resolve(here, 'project'));
}
