// Starts a fixture app with the ESM build. Config comes from env vars and the
// listening port is reported to the parent over IPC.
import express from 'express';
import {Chassis} from 'api-chassis';

const config = JSON.parse(process.env.CHASSIS_CONFIG || '{}');
if (config.database?.instance === 'fake') {
  config.database.instance = {isFakeSequelize: true};
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
