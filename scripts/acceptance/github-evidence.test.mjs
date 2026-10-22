import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyGitHubRead, verifyGitHubWrite, GITHUB_WRITE_PATH, GITHUB_WRITE_MESSAGE } from './github-evidence.mjs';
const content = '# Kuade Harness\n中文验收\n';
const uri = 'repo://jiangrui06/Kuade-Hermes/refs/heads/main/contents/README.md';
const reference = { login: 'fixture', userId: 123, commit: 'a'.repeat(40), readmeBlob: createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0${content}`).digest('hex') };
function fixture() {
  const rows = [];
  const call = (name, args, text) => {
    const callId = String(rows.length);
    rows.push({ type: 'tool/call', data: { callId, name, arguments: JSON.stringify(args) } });
    rows.push({ type: 'tool/result', data: { message: { toolCallId: callId, isError: false, content: [{ type: 'text', text }] } } });
  };
  call('mcp__github__get_me', {}, JSON.stringify({ login: 'fixture', id: 123 }));
  call('mcp__github__list_commits', { owner: 'jiangrui06', repo: 'Kuade-Hermes', sha: 'main' }, JSON.stringify([{ sha: reference.commit }]));
  call('read_mcp_resource', { server: 'github', uri }, 'MCP server: github\n' + JSON.stringify({ contents: [{ uri, text: content }] }));
  rows.push({ type: 'turn/end', data: { reason: { kind: 'completed' } } });
  return rows;
}
test('validates actual MCP resource content including UTF-8 blob length', () => assert.equal(verifyGitHubRead(fixture(), reference).login, 'fixture'));
test('rejects wrong content, account and commit', () => {
  for (const override of [{ readmeBlob: 'wrong' }, { login: 'other' }, { userId: 0 }, { commit: 'b'.repeat(40) }]) assert.throws(() => verifyGitHubRead(fixture(), { ...reference, ...override }));
});
test('rejects mutations and resources from other servers', () => {
  const mutation = fixture(); mutation[0].data.name = 'mcp__github__push_files';
  assert.throws(() => verifyGitHubRead(mutation, reference));
  const wrongServer = fixture(); wrongServer[4].data.arguments = JSON.stringify({ server: 'other', uri });
  assert.throws(() => verifyGitHubRead(wrongServer, reference));
});
test('rejects failed tool results and incomplete turns', () => {
  const failed = fixture(); failed[5].data.message.isError = true;
  assert.throws(() => verifyGitHubRead(failed, reference));
  assert.throws(() => verifyGitHubRead(fixture().slice(0, -1), reference));
});

function writeFixture() {
  const content = '{"status":"passed"}\n';
  const commit = 'b'.repeat(40); const parent = 'a'.repeat(40);
  const args = { owner: 'jiangrui06', repo: 'Kuade-Hermes', branch: 'main', path: GITHUB_WRITE_PATH, message: GITHUB_WRITE_MESSAGE, content };
  const events = [
    { type: 'tool/call', data: { callId: '1', name: 'mcp__github__create_or_update_file', arguments: JSON.stringify(args) } },
    { type: 'tool/result', data: { message: { toolCallId: '1', isError: false, content: [{ type: 'text', text: JSON.stringify({ commit: { sha: commit } }) }] } } },
    { type: 'turn/end', data: { reason: { kind: 'completed' } } },
  ];
  const reference = { content, parent, remoteCommit: { sha: commit, parents: [{ sha: parent }], commit: { message: GITHUB_WRITE_MESSAGE }, files: [{ filename: GITHUB_WRITE_PATH, status: 'added' }] }, remoteContent: { encoding: 'base64', content: Buffer.from(content).toString('base64'), sha: createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0${content}`).digest('hex') } };
  return { events, reference };
}
test('verifies one exact remote addition against independent commit and content', () => {
  const f = writeFixture(); assert.equal(verifyGitHubWrite(f.events, f.reference).path, GITHUB_WRITE_PATH);
});
test('rejects extra changes, wrong parent, altered content and multiple writes', () => {
  let f = writeFixture(); f.reference.remoteCommit.files.push({ filename: 'other', status: 'modified' }); assert.throws(() => verifyGitHubWrite(f.events, f.reference));
  f = writeFixture(); f.reference.parent = 'wrong'; assert.throws(() => verifyGitHubWrite(f.events, f.reference));
  f = writeFixture(); f.reference.remoteContent.content = Buffer.from('changed').toString('base64'); assert.throws(() => verifyGitHubWrite(f.events, f.reference));
  f = writeFixture(); f.events.unshift(f.events[0]); assert.throws(() => verifyGitHubWrite(f.events, f.reference));
  f = writeFixture(); const args = JSON.parse(f.events[0].data.arguments); args.content = Buffer.from(args.content).toString('base64'); f.events[0].data.arguments = JSON.stringify(args); assert.throws(() => verifyGitHubWrite(f.events, f.reference));
});
test('repair requires the observed prior blob and still changes only the approved file', () => {
  const f = writeFixture(); f.reference.previousBlob = 'c'.repeat(40);
  const args = JSON.parse(f.events[0].data.arguments); args.sha = f.reference.previousBlob; f.events[0].data.arguments = JSON.stringify(args);
  f.reference.remoteCommit.files[0].status = 'modified';
  assert.equal(verifyGitHubWrite(f.events, f.reference).path, GITHUB_WRITE_PATH);
  f.reference.previousBlob = 'd'.repeat(40); assert.throws(() => verifyGitHubWrite(f.events, f.reference));
});
