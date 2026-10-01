// Shell-only V8 benchmark. No listener, backend, build, or dependency writes.
// Run: git show <base>:src/lib/search.ts > /tmp/task11-base-search.ts
//      node scripts/search-benchmark.mjs /tmp/task11-base-search.ts
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';

const root = path.resolve(import.meta.dirname, '..');
const baselinePath = process.argv[2];
assert.ok(baselinePath, 'Pass the baseline search.ts path');
const baselineSource = (await readFile(baselinePath, 'utf8'))
  .replace('from "./quickAdd"', `from ${JSON.stringify(path.join(root, 'src/lib/quickAdd.ts'))}`);
const baselineId = path.join(root, 'src/lib/__task11_baseline.ts');
const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'task11-search-'));
const server = await createServer({
  root, configFile: false, cacheDir,
  server: { middlewareMode: true, watch: null, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [{
    name: 'search-baseline',
    resolveId: (id) => id === baselineId ? baselineId : undefined,
    load: (id) => id === baselineId ? baselineSource : undefined,
  }],
});

try {
  const before = await server.ssrLoadModule(baselineId);
  const after = await server.ssrLoadModule('/src/lib/search.ts');
  let comparisons = 0;
  const compare = (items, query, now) => {
    assert.deepStrictEqual(after.rankItems(items, query, now), before.rankItems(items, query, now));
    comparisons++;
  };
  const now = Date.UTC(2026, 8, 30, 12);
  const titles = [
    'Introduction to operating systems and computer architecture',
    'Week 04 lecture notes - Virtual memory and address translation.pdf',
    'Problem set 3: Threads, locks, and concurrent data structures',
    'Midterm exam study guide and practice questions',
    'Lecture recording: Process scheduling and synchronization',
    'Reading assignment: A history of scientific discovery',
    'Discussion worksheet - Applications of differential equations',
    'Project milestone: Multithreaded web server implementation',
  ];
  const kinds = ['file', 'page', 'assignment', 'announcement', 'module', 'course'];
  const fixture = (count) => Array.from({ length: count }, (_, i) => ({
    kind: kinds[i % kinds.length], canvasId: i, courseCanvasId: i % 5,
    title: `${titles[i % titles.length]} ${i}`, htmlUrl: '',
    updatedAt: i % 7 === 0 ? undefined : now - (i % 30) * 86_400_000,
    dueAt: i % 3 === 0 ? now + ((i % 21) - 10) * 86_400_000 : undefined,
  }));

  // Differential checks include later word matches after an earlier substring,
  // overlapping occurrences, every separator, Unicode and multiword highlights.
  const edgeTitles = ['cat', 'catfish', 'bobcat cat', 'banana ana', 'aaaa aa',
    'Café résumé', 'İstanbul', 'e\u0301cole', '😀 emoji', 'Multithreaded Web Server',
    ...[...' -_/.:,·—–([{\t\n'].map((separator) => `bobcat${separator}cat`)];
  const edgeRows = edgeTitles.map((title, i) => ({ ...fixture(1)[0], canvasId: i, title }));
  const edgeItems = after.buildSearchItems(edgeRows);
  const edgeQueries = ['', ' ', 'cat', 'CAT', 'ana', 'aa', 'cat bob', 'mwsv', 'cafe',
    'résumé', 'İ', '😀', 'emoji', 'cat cat', 'zzzz', '  cat   bob  ',
    ...edgeTitles.flatMap((title) => [title, title.slice(1, 4), title.slice(-4)])];
  for (const query of edgeQueries) {
    compare(edgeItems, query, now);
  }

  let seed = 11;
  const random = (limit) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % limit;
  };
  const alphabet = [...'aabccde ABCéİ😀 -_/.:,·—–([{\t\n'];
  const randomRows = fixture(256).map((row) => ({
    ...row, title: Array.from({ length: random(90) }, () => alphabet[random(alphabet.length)]).join(''),
  }));
  const randomItems = after.buildSearchItems(randomRows);
  for (const row of randomRows) {
    const start = random(row.title.length + 1);
    compare(randomItems, row.title.slice(start, start + 1 + random(12)), now);
  }

  const queries = ['', 'lecture', 'virtual memory', 'mwsv', 'zzzz'];
  const percentile = (sorted, fraction) => sorted[Math.ceil(sorted.length * fraction) - 1];
  const results = [];
  let checksum = 0;
  for (const count of [500, 2000, 5000]) {
    const rows = fixture(count);
    assert.deepStrictEqual(after.buildSearchItems(rows), before.buildSearchItems(rows));
    const items = after.buildSearchItems(rows);
    // Every prefix of these terms checks the result for each typing step.
    for (const query of queries.flatMap((q) => Array.from({ length: q.length + 1 }, (_, i) => q.slice(0, i)))) {
      compare(items, query, now);
    }
    for (const query of queries) {
      for (let i = 0; i < 60; i++) {
        checksum += before.rankItems(items, query, now).length;
        checksum += after.rankItems(items, query, now).length;
      }
      const timings = [[], []];
      const runners = [before.rankItems, after.rankItems];
      // Alternate measurement order to reduce JIT/GC/host-load order bias.
      for (let sample = 0; sample < 120; sample++) {
        for (const index of sample % 2 === 0 ? [0, 1] : [1, 0]) {
          const start = performance.now();
          for (let repeat = 0; repeat < 5; repeat++) checksum += runners[index](items, query, now).length;
          timings[index].push((performance.now() - start) / 5);
        }
      }
      const [oldStats, newStats] = timings.map((times) => {
        times.sort((a, b) => a - b);
        return { median_ms: percentile(times, 0.5), p95_ms: percentile(times, 0.95) };
      });
      results.push({ count, query, before: oldStats, after: newStats });
    }
  }
  console.log(JSON.stringify({
    node: process.version, v8: process.versions.v8, cpu: os.cpus()[0].model,
    baselinePath, equality: 'All complete results, scores, order and highlight ranges match',
    comparisons, warmup: 60, samples: 120, callsPerSample: 5, checksum, results,
  }, null, 2));
} finally {
  await server.close();
  await rm(cacheDir, { recursive: true, force: true });
}
