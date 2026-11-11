import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || "g7-dev-solicitudes";

/**
 * Lambda: g7-dev-process-decision
 * Persiste la decisión de aprobación o rechazo en la tabla DynamoDB g7-dev-solicitudes.
 */
export const handler = async (event) => {
  console.log("Procesando decisión en process-decision:", JSON.stringify(event, null, 2));

  const { requestId, decision, decidedBy, comments, approvalTier } = event;

  if (!requestId) {
    throw new Error("requestId es obligatorio para actualizar el estado final");
  }

  const finalStatus = decision || "APPROVED";
  const updatedAt = new Date().toISOString();

  try {
    const response = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { requestId },
        UpdateExpression: "SET #status = :s, decidedBy = :db, comments = :c, approvalTier = :at, updatedAt = :u",
        ExpressionAttributeNames: {
          "#status": "status"
        },
        ExpressionAttributeValues: {
          ":s": finalStatus,
          ":db": decidedBy || "SYSTEM",
          ":c": comments || "Decisión procesada en flujo",
          ":at": approvalTier || "STANDARD",
          ":u": updatedAt
        },
        ReturnValues: "ALL_NEW"
      })
    );

    console.log(`Solicitud ${requestId} actualizada exitosamente a estado: ${finalStatus}`);

    return {
      success: true,
      requestId,
      status: finalStatus,
      updatedRecord: response.Attributes
    };
  } catch (error) {
    console.error(`Error al actualizar estado en DynamoDB (${TABLE_NAME}) para requestId ${requestId}:`, error);
    throw error;
  }
};
