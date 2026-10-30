// Starts a fixture app with the ESM build. Config comes from env vars and the
// listening port is reported to the parent over IPC.
import {existsSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import express from 'express';
import {Chassis} from 'api-chassis';

const config = JSON.parse(process.env.CHASSIS_CONFIG || '{}');
// Fixture apps with a schema.mjs get a fresh in-memory Postgres.
const schema = path.join(process.env.CHASSIS_ROOT, 'schema.mjs');
if (existsSync(schema)) {
  const {createDatabase} = await import(pathToFileURL(schema).href);
  config.database = {instance: await createDatabase()};
}
if (config.auth?.payload === 'fixture') {
  config.auth.payload = (await import('./auth-payload.mjs')).default;
}
const chassis = new Chassis({
  app: express(),
  rootDir: process.env.CHASSIS_ROOT,
  ...config,
});
await chassis.ready;
process.send({port: chassis.server.address().port});
