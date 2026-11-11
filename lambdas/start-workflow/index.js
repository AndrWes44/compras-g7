import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || "g7-dev-solicitudes";

/**
 * Lambda: g7-dev-start-workflow
 * Valida los datos y persiste la solicitud inicial en estado PENDING.
 * Incluye ConditionExpression para evitar sobrescribir solicitudes existentes (idempotencia).
 */
export const handler = async (event) => {
  console.log("Iniciando registro de solicitud:", JSON.stringify(event, null, 2));

  const {
    requestId,
    amount,
    applicant,
    department,
    description,
    articulos,
    proveedorId
  } = event;

  if (!requestId || amount === undefined || Number(amount) <= 0) {
    const errorMsg = "Solicitud inválida: 'requestId' y 'amount' (> 0) son obligatorios.";
    console.error(errorMsg, { requestId, amount });
    throw new Error(errorMsg);
  }

  const timestamp = new Date().toISOString();
  const numericAmount = Number(amount);
  const nivelRequerido = numericAmount <= 1000 ? "Gerente" : "Director";

  const newRecord = {
    requestId,
    amount: numericAmount,
    applicant: applicant || "SOLICITANTE_GENERAL",
    department: department || "GENERAL",
    description: description || "Solicitud de compra",
    articulos: articulos || [],
    proveedorId: proveedorId || "NO_ESPECIFICADO",
    status: "PENDING",
    requiereAprobacionDe: nivelRequerido,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: newRecord,
        // Protege contra sobrescritura si el requestId ya existía previamente
        ConditionExpression: "attribute_not_exists(requestId)"
      })
    );

    console.log(`Solicitud ${requestId} registrada en PENDING. Requiere: ${nivelRequerido}`);
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      console.warn(`La solicitud ${requestId} ya existe en DynamoDB. Omitiendo sobrescritura.`);
      return {
        success: false,
        message: `La solicitud ${requestId} ya existía en el sistema.`,
        requestId,
        duplicated: true
      };
    }
    console.error("Error al persistir solicitud inicial en DynamoDB:", error);
    throw error;
  }

  return {
    success: true,
    requestId: newRecord.requestId,
    amount: newRecord.amount,
    applicant: newRecord.applicant,
    department: newRecord.department,
    status: newRecord.status,
    requiereAprobacionDe: newRecord.requiereAprobacionDe,
    totalArticulos: newRecord.articulos.length
  };
};
