"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
Object.assign(process.env, {
  NODE_ENV: "test", AWS_REGION: "us-east-2", AWS_EC2_METADATA_DISABLED: "true",
  AWS_LAMBDA_FUNCTION_NAME: "local-body-regression",
  STATE_MACHINE_ARN: "arn:aws:states:us-east-2:000000000000:stateMachine:test",
  COGNITO_USER_POOL_ID: "us-east-2_TEST123", COGNITO_APP_CLIENT_ID: "test-client"
});
const { handler } = require("../src/lambda.js");
async function login(body, base64 = false) {
  const result = await handler({ version: "2.0", routeKey: "$default", rawPath: "/api/auth/login", rawQueryString: "",
    headers: { host: "localhost", "content-type": "application/json" },
    requestContext: { stage: "$default", requestId: "body-local-only", http: {
      method: "POST", path: "/api/auth/login", sourceIp: "192.0.2.1", protocol: "HTTP/1.1"
    } }, body: base64 ? Buffer.from(body).toString("base64") : body, isBase64Encoded: base64
  }, { getRemainingTimeInMillis: () => 30000 });
  return { status: result.statusCode, data: JSON.parse(result.body) };
}
test("Lambda conserva JSON despues del limitador asincrono, incluido base64", async () => {
  for (const base64 of [false, true]) {
    const response = await login(JSON.stringify({ email: "test@example.invalid", password: "" }), base64);
    assert.equal(response.status, 400);
    assert.match(response.data.mensaje, /Correo y contrase/);
    assert.equal(response.data.field, undefined);
  }
});
test("Lambda rechaza JSON malformado antes de validar campos", async () => {
  const response = await login('{"email":');
  assert.equal(response.status, 400);
  assert.equal(response.data.mensaje, "JSON inválido.");
});
test("Lambda aplica limite de cuerpo de login tambien despues de middleware asincrono", async () => {
  const response = await login(JSON.stringify({ email: "test@example.invalid", password: "x".repeat(17000) }));
  assert.equal(response.status, 413);
});
