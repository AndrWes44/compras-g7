/**
 * Lambda: g7-dev-evaluate-amount
 * Evalúa las reglas de negocio por monto y asigna el rol o nivel jerárquico requerido.
 * Reglas:
 * - amount <= 1000  => AUTO_APPROVED
 * - amount <= 5000  => REQUIRES_SUPERVISOR
 * - amount >  5000  => REQUIRES_MANAGER
 */
export const handler = async (event) => {
  console.log("Evaluando monto en evaluate-amount:", JSON.stringify(event, null, 2));

  const amount = Number(event.amount);
  let approvalTier = "";
  let requiredRole = "";

  if (amount <= 1000) {
    approvalTier = "AUTO_APPROVED";
    requiredRole = "SISTEMA";
  } else if (amount <= 5000) {
    approvalTier = "REQUIRES_SUPERVISOR";
    requiredRole = "SUPERVISOR";
  } else {
    approvalTier = "REQUIRES_MANAGER";
    requiredRole = "GERENCIA";
  }

  console.log(`Evaluación concluida para ${event.requestId}: Monto=${amount}, Tier=${approvalTier}, Rol=${requiredRole}`);

  return {
    ...event,
    amount,
    approvalTier,
    requiredRole,
    evaluatedAt: new Date().toISOString()
  };
};
