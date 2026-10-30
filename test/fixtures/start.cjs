// Starts a fixture app with the CommonJS build. Config comes from env vars and
// the listening port is reported to the parent over IPC.
const {existsSync} = require('node:fs');
const path = require('node:path');
const express = require('express');
const {Chassis} = require('api-chassis');

async function main() {
  const config = JSON.parse(process.env.CHASSIS_CONFIG || '{}');
  // Fixture apps with a schema.mjs get a fresh in-memory Postgres.
  const schema = path.join(process.env.CHASSIS_ROOT, 'schema.mjs');
  if (existsSync(schema)) {
    config.database = {instance: await require(schema).createDatabase()};
  }
  if (config.auth?.payload === 'fixture') {
    config.auth.payload = require('./auth-payload.mjs').default;
  }
  const chassis = new Chassis({
    app: express(),
    rootDir: process.env.CHASSIS_ROOT,
    ...config,
  });
  await chassis.ready;
  process.send({port: chassis.server.address().port});
}

main();
