import Ably from "ably";
import { env } from "@core/config/env.config";
import { logger } from "@core/utils/logger";

let ably: Ably.Realtime | null = null;

/** Cliente Ably perezoso. `null` si no hay `ABLY_API_KEY` (publicaciones dry-run). */
export const getAbly = (): Ably.Realtime | null => {
  if (!env.ABLY_API_KEY) return null;
  if (!ably) ably = new Ably.Realtime({ key: env.ABLY_API_KEY });
  return ably;
};

/** Publica un evento en el canal privado del usuario. No-op sin Ably. */
export const broadcastToUser = async (
  userId: string,
  event: Record<string, unknown>
): Promise<void> => {
  const client = getAbly();
  if (!client) {
    logger.debug(`[ably:dry-run] user:${userId} ${JSON.stringify(event)}`);
    return;
  }
  const channel = client.channels.get(`user:${userId}`);
  await channel.publish("NOTIFICATION", event);
};
