// Starts a fixture app with the CommonJS build. Config comes from env vars and
// the listening port is reported to the parent over IPC.
const express = require('express');
const {Chassis} = require('api-chassis');

const config = JSON.parse(process.env.CHASSIS_CONFIG || '{}');
if (config.database?.instance === 'fake') {
  config.database.instance = {isFakeSequelize: true};
}
if (config.auth?.payload === 'fixture') {
  config.auth.payload = require('./auth-payload.mjs').default;
}
const chassis = new Chassis({
  app: express(),
  rootDir: process.env.CHASSIS_ROOT,
  ...config,
});
chassis.ready.then(() => process.send({port: chassis.server.address().port}));
