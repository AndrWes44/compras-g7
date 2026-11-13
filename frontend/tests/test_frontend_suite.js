/**
 * Test Suite Riguroso - AURA Compras Frontend Modules
 * Valida Fase 1 (Config & API Client), Fase 2 (Auth Service) y Fase 3 (Normalizador de Datos)
 */

const assert = require('assert');

// Mock browser globals
global.window = {};
global.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] || null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; }
};
global.sessionStorage = {
  _data: {},
  getItem(k) { return this._data[k] || null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; }
};

// Cargar módulos
require('../public/config.js');
require('../public/auth.js');
require('../public/api.js');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
  }
}

async function runAll() {
  console.log('\n======================================================');
  console.log('🧪 INICIANDO BATERÍA DE PRUEBAS RIGUROSAS (FASE 1, 2, 3)');
  console.log('======================================================\n');

  // --- PRUEBAS FASE 1: CONFIGURACIÓN ---
  console.log('--- FASE 1: Configuración de Entorno ---');
  test('AURA_CONFIG debe tener configurada una URL base valida', () => {
    assert(window.AURA_CONFIG.apiBaseUrl.startsWith('http'), 'apiBaseUrl debe iniciar con http o https');
  });

  test('setApiBaseUrl debe normalizar barras finales y persistir en localStorage', () => {
    const defaultUrl = window.AURA_CONFIG.apiBaseUrl;
    window.AURA_CONFIG.setApiBaseUrl('http://192.168.1.50:4000///');
    assert.strictEqual(window.AURA_CONFIG.apiBaseUrl, 'http://192.168.1.50:4000');
    assert.strictEqual(localStorage.getItem('AURA_API_URL'), 'http://192.168.1.50:4000');
    window.AURA_CONFIG.resetDefaults();
    assert.strictEqual(window.AURA_CONFIG.apiBaseUrl, defaultUrl);
  });

  // --- PRUEBAS FASE 2: AUTH SERVICE (RBAC & TOKENS) ---
  console.log('\n--- FASE 2: Servicio de Autenticación y RBAC ---');
  await runAsyncTest('Login debe rechazar credenciales vacías', async () => {
    let failed = false;
    try {
      await window.authService.login('', '');
    } catch {
      failed = true;
    }
    assert.strictEqual(failed, true, 'No debe permitir login con credenciales en blanco');
  });

  await runAsyncTest('Login asigna rol Gerente según correo y genera sesión', async () => {
    const user = await window.authService.login('gerente@g7.com', 'G7_User2026!');
    assert.strictEqual(user.role, 'gerente');
    assert.strictEqual(user.cognitoGroup, 'Gerente');
    assert.strictEqual(window.authService.isAuthenticated(), true);
    assert(window.authService.getIdToken().startsWith('cognito-jwt-gerente-'));
  });

  await runAsyncTest('Login asigna rol Director para solicitudes de alto monto', async () => {
    const user = await window.authService.login('director@g7.com', 'G7_User2026!');
    assert.strictEqual(user.role, 'director');
    assert.strictEqual(user.cognitoGroup, 'Director');
    assert(window.authService.getIdToken().startsWith('cognito-jwt-director-'));
  });

  test('Logout purga sessionStorage y localStorage completamente', () => {
    window.authService.logout();
    assert.strictEqual(window.authService.isAuthenticated(), false);
    assert.strictEqual(window.authService.getIdToken(), null);
  });

  // --- PRUEBAS FASE 3: API SERVICE VALIDATION ---
  console.log('\n--- FASE 3: Validación de Contratos y Peticiones ---');
  await runAsyncTest('createSolicitud rechaza descripción vacía', async () => {
    let rejected = false;
    try {
      await window.apiService.createSolicitud({ descripcion: '   ', monto: 100 });
    } catch (e) {
      rejected = true;
      assert(e.message.includes('descripción'));
    }
    assert.strictEqual(rejected, true);
  });

  await runAsyncTest('createSolicitud rechaza monto menor o igual a cero', async () => {
    let rejected = false;
    try {
      await window.apiService.createSolicitud({ descripcion: 'Compra laptop', monto: 0 });
    } catch (e) {
      rejected = true;
      assert(e.message.includes('monto'));
    }
    assert.strictEqual(rejected, true);
  });

  console.log('\n======================================================');
  console.log(`📊 RESULTADOS: ${passedTests}/${totalTests} pruebas pasaron exitosamente.`);
  console.log('======================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAll();
