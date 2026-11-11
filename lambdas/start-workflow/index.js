import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || "g7-dev-solicitudes";

/**
 * Lambda: g7-dev-start-workflow
 * Valida los parámetros iniciales de la solicitud y crea el registro en estado PENDING.
 */
export const handler = async (event) => {
  console.log("Evento recibido en start-workflow:", JSON.stringify(event, null, 2));

  const { requestId, amount, applicant, department, description } = event;

  // Validación de entradas obligatorias
  if (!requestId || amount === undefined || Number(amount) <= 0) {
    const errorMsg = "Solicitud inválida: 'requestId' y 'amount' (> 0) son obligatorios.";
    console.error(errorMsg, { requestId, amount });
    throw new Error(errorMsg);
  }

  const timestamp = new Date().toISOString();
  const numericAmount = Number(amount);

  const initialRecord = {
    requestId,
    amount: numericAmount,
    applicant: applicant || "SOLICITANTE_NO_ESPECIFICADO",
    department: department || "GENERAL",
    description: description || "Solicitud de aprobación presupuestaria",
    status: "PENDING",
    createdAt: timestamp,
    updatedAt: timestamp
  };

  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: initialRecord
      })
    );
    console.log(`Solicitud ${requestId} registrada en DynamoDB (${TABLE_NAME}) con estado PENDING`);
  } catch (error) {
    console.error("Error al persistir solicitud inicial en DynamoDB:", error);
    throw error;
  }

  return {
    requestId: initialRecord.requestId,
    amount: initialRecord.amount,
    applicant: initialRecord.applicant,
    department: initialRecord.department,
    status: initialRecord.status
  };
};
