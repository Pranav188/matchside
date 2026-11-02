import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, mkdir, writeFile, cp, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ts from 'typescript';

const exec = promisify(execFile);

describe('Vercel Node deployment output', () => {
  it('loads emitted ESM handlers without tsx and serves the bundled recording', async () => {
    const root = process.cwd();
    const config = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    const output = await mkdtemp(join(tmpdir(), 'matchside-emitted-'));
    try {
      for (const directory of ['api', 'server', 'shared']) {
        for (const file of await readdir(join(root, directory))) {
          if (!file.endsWith('.ts')) continue;
          const name = join(directory, file);
          const compiled = ts.transpileModule(await readFile(join(root, name), 'utf8'), { compilerOptions: parsed.options, fileName: name });
          const target = join(output, name.replace(/\.ts$/, '.js'));
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, compiled.outputText);
        }
      }
      await writeFile(join(output, 'package.json'), '{"type":"module"}');
      await symlink(resolve(root, 'node_modules'), join(output, 'node_modules'), 'dir');
      await cp(join(root, 'data', 'recorded-match.json'), join(output, 'recorded-match.json'));
      await mkdir(join(output, 'data'));
      await cp(join(root, 'data', 'recorded-answers.json'), join(output, 'data', 'recorded-answers.json'));
      const script = `
        import handler from './api/health.js';
        import { readFile } from 'node:fs/promises';
        const health = await handler.fetch(new Request('https://matchside.invalid/api/health'));
        const response = await handler.fetch(new Request('https://matchside.invalid/api/match?mode=example'));
        const match = await response.json();
        const saved = JSON.parse(await readFile('data/recorded-answers.json', 'utf8'));
        const cached = [];
        for (const entry of saved.entries) {
          const result = await handler.fetch(new Request('https://matchside.invalid/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'example', question: entry.question, ...(entry.eventId ? { eventId: entry.eventId } : {}) }) }));
          const answer = await result.json();
          cached.push(result.status === 200 && answer.cached === true && answer.claims.length > 0);
        }
        console.log(JSON.stringify({ savedAnswers: cached.length === 3 && cached.every(Boolean), health: health.status, recorded: response.status, mode: match.mode, fixture: match.snapshot?.fixtureId }));
      `;
      const { stdout } = await exec(process.execPath, ['--input-type=module', '-e', script], {
        cwd: output,
        env: { PATH: process.env.PATH, RECORDED_SNAPSHOT_PATH: 'recorded-match.json' },
      });
      expect(JSON.parse(stdout)).toEqual({ savedAnswers: true, health: 200, recorded: 200, mode: 'example', fixture: '19713874' });
    } finally { await rm(output, { recursive: true, force: true }); }
  });
});
