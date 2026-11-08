import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
const build = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });
assert.equal(build.status, 0, 'Production build failed');
const port = '13091';
const server = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, HOST: '127.0.0.1', PORT: port, PUBLIC_URL: 'https://lecture.example.com', INSTRUCTOR_PASSWORD: '1937', STUDENT_PASSWORD: '1234' },
  stdio: 'ignore'
});
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error('Test server exited');
    try { ready = (await fetch(`http://127.0.0.1:${port}/healthz`)).ok; } catch {}
    if (ready) break;
    await delay(100);
  }
  assert.ok(ready, 'Test server is not ready');
  for (const path of ['/', '/instructor']) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<div id="root"><\/div>/);
  }
  const test = spawnSync(process.execPath, ['test-flow.js'], {
    env: { ...process.env, SERVER_URL: `http://127.0.0.1:${port}`, EXPECTED_PUBLIC_URL: 'https://lecture.example.com', INSTRUCTOR_PASSWORD: '1937', STUDENT_PASSWORD: '1234' },
    stdio: 'inherit', timeout: 35000
  });
  assert.equal(test.status, 0, 'Interaction checks failed');
  console.log('LOCAL_VERIFIED');
} finally {
  server.kill('SIGTERM');
  await new Promise(resolve => server.once('close', resolve));
}
