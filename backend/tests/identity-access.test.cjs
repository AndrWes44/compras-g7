// Comprueba el acceso de cuentas registradas y administradores.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createIdentity } = require("../src/server").internals;
function fixture() {
  const calls = [], state = { groups: ["Solicitante"], verified: true, status: "CONFIRMED", failure: null };
  const attrs = () => [{ Name: "email", Value: "user@example.invalid" }, { Name: "sub", Value: "user-sub" }, { Name: "email_verified", Value: String(state.verified) }];
  const client = { async send(command) {
    calls.push(command);
    if (state.failure === command.constructor.name) throw new Error("private-details");
    switch (command.constructor.name) {
      case "GetUserCommand": return { Username: "cognito-user", UserAttributes: attrs() };
      case "AdminGetUserCommand": return { Username: "cognito-user", UserAttributes: attrs(), UserStatus: state.status, Enabled: true };
      case "AdminListGroupsForUserCommand": return { Groups: state.groups.map(GroupName => ({ GroupName })) };
      case "SignUpCommand": return { UserSub: "new-sub", UserConfirmed: false };
      default: return {};
    }
  } };
  const verifier = { verify: async () => ({ sub: "user-sub", "cognito:groups": state.groups }) };
  const identity = createIdentity({ region: "us-east-2", clientId: "client", userPoolId: "pool" }, { client, verifier });
  return { identity, calls, state };
}
test("grupo Administrador autentica sin grupos de negocio y se revalida con grupos actuales", async () => {
  const f = fixture(); f.state.groups = ["Administrador"];
  const user = await f.identity.authenticate("test-token");
  assert.equal(user.isAdmin, true); assert.deepEqual(user.roles, []);
  await f.identity.assertCurrentAdmin(user);
  f.state.groups = [];
  await assert.rejects(f.identity.assertCurrentAdmin(user), { status: 403 });
});
test("signup no solicita grupos ni correo verificado automaticamente", async () => {
  const f = fixture();
  await f.identity.signUp({ email: "user@example.invalid", password: "test-placeholder", name: "Usuario" });
  const command = f.calls[0];
  assert.equal(command.constructor.name, "SignUpCommand");
  assert.equal(command.input.UserAttributes.some(v => v.Name === "email_verified"), false);
  assert.equal(command.input.GroupName, undefined);
});
test("asignar rol requiere confirmado/verificado y nunca concede grupo administrativo", async () => {
  const f = fixture(); f.state.verified = false;
  await assert.rejects(f.identity.assignBusinessRole("cognito-user", "Director", "user-sub", "user@example.invalid"), { status: 409 });
  assert.equal(f.calls.some(c => c.constructor.name === "AdminAddUserToGroupCommand"), false);
  await assert.rejects(f.identity.assignBusinessRole("cognito-user", "Administrador"), { status: 400 });
});
test("asignar negocio retira roles previos y revoca tokens antes de terminar", async () => {
  const f = fixture(); f.state.groups = ["Solicitante", "Compras"];
  await f.identity.assignBusinessRole("cognito-user", "Director", "user-sub", "user@example.invalid");
  assert.deepEqual(f.calls.filter(c => c.constructor.name === "AdminRemoveUserFromGroupCommand").map(c => c.input.GroupName), ["Solicitante", "Compras"]);
  assert.equal(f.calls.at(-1).constructor.name, "AdminUserGlobalSignOutCommand");
});
test("fallo de retiro de grupo o de revocacion no devuelve falso exito", async () => {
  for (const failure of ["AdminRemoveUserFromGroupCommand", "AdminUserGlobalSignOutCommand"]) {
    const f = fixture(); f.state.failure = failure;
    await assert.rejects(f.identity.assignBusinessRole("cognito-user", "Director", "user-sub", "user@example.invalid"));
    assert.equal(f.calls.some(c => c.constructor.name === "AdminUserGlobalSignOutCommand"), true);
  }
});

test("identificador reciclado o correo cambiado no modifica grupos ni revoca otra cuenta", async () => {
  for (const [sub,email] of [["previous-sub","user@example.invalid"],["user-sub","old@example.invalid"]]) {
    const f=fixture();
    await assert.rejects(f.identity.assignBusinessRole("cognito-user","Director",sub,email),{status:409});
    assert.equal(f.calls.some(c=>["AdminAddUserToGroupCommand","AdminRemoveUserFromGroupCommand","AdminUserGlobalSignOutCommand"].includes(c.constructor.name)),false);
  }
});
