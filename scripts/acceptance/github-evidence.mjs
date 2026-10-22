import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const repository = { owner: 'jiangrui06', repo: 'Kuade-Hermes' };
const uri = 'repo://jiangrui06/Kuade-Hermes/refs/heads/main/contents/README.md';
const blobHash = text => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
export const GITHUB_WRITE_PATH = 'docs/acceptance/real-github-read-2026-10-15.json';
export const GITHUB_WRITE_MESSAGE = 'docs: record real GitHub read acceptance';
const texts = message => message.content.filter(row => row.type === 'text').map(row => row.text);
export function verifyGitHubRead(events, reference) {
  assert.equal(events.findLast(row => row.type === 'turn/end')?.data.reason.kind, 'completed');
  const calls = events.filter(row => row.type === 'tool/call').map(row => row.data);
  const results = events.filter(row => row.type === 'tool/result').map(row => row.data.message);
  const successes = [];
  for (const call of calls) {
    const args = JSON.parse(call.arguments);
    if (call.name === 'mcp__github__get_me') assert.deepEqual(args, {});
    else if (['mcp__github__list_commits', 'mcp__github__get_file_contents'].includes(call.name)) {
      assert.equal(args.owner, repository.owner); assert.equal(args.repo, repository.repo);
      if (call.name.endsWith('get_file_contents')) assert.equal(args.path, 'README.md');
    } else if (['list_mcp_resources', 'read_mcp_resource'].includes(call.name)) {
      assert.equal(args.server, 'github');
      if (call.name === 'read_mcp_resource') assert.equal(args.uri, uri);
    } else assert.fail(`Unexpected tool: ${call.name}`);
    const result = results.find(row => row.toolCallId === call.callId && !row.isError);
    if (result) successes.push({ name: call.name, result });
  }
  const me = successes.find(row => row.name === 'mcp__github__get_me');
  assert.ok(me, 'Successful get_me required');
  const account = JSON.parse(texts(me.result).join('\n'));
  assert.equal(account.login, reference.login); assert.equal(account.id, reference.userId);
  const commits = successes.filter(row => row.name === 'mcp__github__list_commits').flatMap(row => JSON.parse(texts(row.result).join('\n')));
  assert.ok(commits.some(row => row.sha === reference.commit), 'Independent commit SHA mismatch');
  const contents = [];
  for (const row of successes) {
    if (row.name === 'read_mcp_resource') for (const text of texts(row.result)) {
      const parsed = JSON.parse(text.slice(text.indexOf('\n') + 1));
      contents.push(...(parsed.contents ?? []).filter(item => item.uri === uri).map(item => item.text));
    }
    if (row.name === 'mcp__github__get_file_contents') {
      for (const item of row.result.content) {
        if (item.type === 'resource' && item.resource.uri === uri) contents.push(item.resource.text);
        if (item.type === 'text') contents.push(item.text);
      }
    }
  }
  assert.ok(contents.some(text => typeof text === 'string' && blobHash(text) === reference.readmeBlob), 'Full README blob does not match independent GitHub API');
  return { login: account.login, userId: account.id, commit: reference.commit, readmeBlob: reference.readmeBlob, calls: calls.map(row => row.name) };
}

export function verifyGitHubWrite(events, reference) {
  assert.equal(events.findLast(row => row.type === 'turn/end')?.data.reason.kind, 'completed');
  const calls = events.filter(row => row.type === 'tool/call').map(row => row.data);
  const results = events.filter(row => row.type === 'tool/result').map(row => row.data.message);
  const writes = calls.filter(row => row.name === 'mcp__github__create_or_update_file');
  assert.equal(writes.length, 1, 'Exactly one remote write required');
  const write = writes[0]; const args = JSON.parse(write.arguments);
  // v2.0.2's MCP schema requires plain text; the official server encodes REST content.
  assert.deepEqual(args, { owner: 'jiangrui06', repo: 'Kuade-Hermes', branch: 'main', path: GITHUB_WRITE_PATH, message: GITHUB_WRITE_MESSAGE, content: reference.content, ...(reference.previousBlob ? { sha: reference.previousBlob } : {}) });
  for (const call of calls.filter(row => row !== write)) {
    const data = JSON.parse(call.arguments);
    if (call.name === 'mcp__github__get_me') assert.deepEqual(data, {});
    else if (['mcp__github__list_commits', 'mcp__github__get_commit', 'mcp__github__get_file_contents'].includes(call.name)) {
      assert.equal(data.owner, 'jiangrui06'); assert.equal(data.repo, 'Kuade-Hermes');
      if (call.name.endsWith('get_file_contents')) assert.equal(data.path, GITHUB_WRITE_PATH);
    } else assert.fail(`Unexpected tool: ${call.name}`);
  }
  const result = results.find(row => row.toolCallId === write.callId && !row.isError);
  assert.ok(result, 'Successful write receipt required');
  assert.ok(texts(result).some(text => text.includes(reference.remoteCommit.sha)), 'Tool receipt commit differs from independent API');
  assert.deepEqual(reference.remoteCommit.parents.map(row => row.sha), [reference.parent]);
  assert.equal(reference.remoteCommit.commit.message, GITHUB_WRITE_MESSAGE);
  assert.deepEqual(reference.remoteCommit.files.map(row => ({ filename: row.filename, status: row.status })), [{ filename: GITHUB_WRITE_PATH, status: reference.previousBlob ? 'modified' : 'added' }]);
  assert.equal(reference.remoteContent.encoding, 'base64');
  assert.equal(Buffer.from(reference.remoteContent.content, 'base64').toString('utf8'), reference.content);
  assert.equal(reference.remoteContent.sha, blobHash(reference.content));
  return { commit: reference.remoteCommit.sha, parent: reference.parent, path: GITHUB_WRITE_PATH, blob: reference.remoteContent.sha, calls: calls.map(row => row.name) };
}
