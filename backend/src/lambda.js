
'use strict';
// Adapta los eventos de API Gateway a la aplicación Express.

const serverlessExpress = require(
  '@codegenie/serverless-express'
);

const app = require('./server');

exports.handler = serverlessExpress({
  app
});
