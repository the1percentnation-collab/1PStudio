import { Client, Connection } from "@temporalio/client";

let clientPromise: Promise<Client> | undefined;

export function temporal(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233" }).then(
      (connection) => new Client({ connection, namespace: process.env.TEMPORAL_NAMESPACE ?? "default" })
    );
  }
  return clientPromise;
}

export const TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE ?? "video-pipeline";
