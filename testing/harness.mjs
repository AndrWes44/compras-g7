import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
const requireBackend = createRequire(new URL('../backend/package.json', import.meta.url));
const express = requireBackend('express');
export async function startBackend() {
  const state = { items: new Map(), commands: [], failPut: false, failScan: false, pages: null, pageIndex: 0, configuration: null };
  class PutCommand { constructor(input) { this.input = input; } }
  class ScanCommand { constructor(input) { this.input = input; } }
  class DynamoDBClient { constructor(config) { state.configuration = config; } }
  const client = { async send(command) {
    state.commands.push(command);
    if (command instanceof PutCommand) {
      if (state.failPut) throw new Error('SIMULATED_STORAGE_ERROR');
      if (state.items.has(command.input.Item.requestId)) throw new Error('ConditionalCheckFailedException');
      state.items.set(command.input.Item.requestId, structuredClone(command.input.Item)); return {};
    }
    if (state.failScan) throw new Error('SIMULATED_STORAGE_ERROR');
    if (state.pages) return state.pages[state.pageIndex++] ?? { Items: [] };
    return { Items: [...state.items.values()].map(item => structuredClone(item)) };
  } };
  let app;
  function factory() { app = express(); app.listen = () => {}; return app; }
  factory.json = express.json;
  const source = fs.readFileSync(new URL('../backend/src/server.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, {
    require(name) {
      if (name === 'express') return factory;
      if (name === 'node:crypto') return { randomUUID };
      if (name === '@aws-sdk/client-dynamodb') return { DynamoDBClient };
      if (name === '@aws-sdk/lib-dynamodb') return { PutCommand, ScanCommand, DynamoDBDocumentClient: { from: () => client } };
      throw new Error('Dependencia nueva: actualizar harness antes de usarla: ' + name);
    }, console: { log() {}, error() {} }
  }, { filename: 'backend/src/server.js', timeout: 2000 });
  app.listen = express.application.listen;
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return { state, baseUrl, async close() { await new Promise(resolve => server.close(resolve)); } };
}
