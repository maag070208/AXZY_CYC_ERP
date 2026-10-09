import type { Prisma, PrismaClient } from "@prisma/client";
import type { NotificationRecipient } from "@core/ports/notification.port";

type Client = PrismaClient | Prisma.TransactionClient;

/**
 * Destinatarios de avisos para un alumno (M19): su cuenta (bandeja interna),
 * su correo/teléfono (o el de su cuenta) y los de sus tutores — todos, solo el
 * responsable de pago o ninguno.
 */
export const studentContacts = async (
  client: Client,
  studentId: string,
  guardians: "all" | "payer" | "none" = "none"
): Promise<{ nombre: string; recipients: NotificationRecipient[] } | null> => {
  const student = await client.student.findUnique({
    where: { id: studentId },
    select: {
      nombres: true,
      apellidoPaterno: true,
      email: true,
      telefono: true,
      userId: true,
      user: { select: { email: true } },
      guardians: guardians === "none" ? false : { where: guardians === "payer" ? { esResponsablePago: true } : {}, select: { email: true, telefono: true } },
    },
  });
  if (!student) return null;
  const recipients: NotificationRecipient[] = [
    { userId: student.userId, email: student.email ?? student.user?.email ?? null, phone: student.telefono },
    ...(student.guardians ?? []).map((g) => ({ email: g.email, phone: g.telefono })),
  ];
  return { nombre: `${student.nombres} ${student.apellidoPaterno}`, recipients };
};
