/**
 * Lambda: g7-dev-evaluate-amount
 * Evalúa las reglas de negocio oficiales del Grupo 7:
 * - Monto <= 1000  => Aprobación requerida por Gerente de Área (ROL-02)
 * - Monto >  1000  => Aprobación requerida por Director (ROL-03)
 */
export const handler = async (event) => {
  console.log("Evaluando asignación jerárquica:", JSON.stringify(event, null, 2));

  const amount = Number(event.amount);
  const requiresManager = amount <= 1000;

  const evaluationResult = {
    ...event,
    amount,
    approvalTier: requiresManager ? "REQUIRES_GERENTE" : "REQUIRES_DIRECTOR",
    requiredRole: requiresManager ? "ROL-02" : "ROL-03",
    roleName: requiresManager ? "Gerente" : "Director",
    evaluatedAt: new Date().toISOString()
  };

  console.log(`Evaluación concluida para ${event.requestId}: Requiere ${evaluationResult.roleName}`);
  return evaluationResult;
};
