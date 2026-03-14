/**
 * Pricing updater — called from the daily cron in the scheduled handler.
 * Stamps priceUpdatedAt on all active provider rows.
 *
 * Prices are maintained in the DB via seed and admin UI.
 * When providers expose pricing APIs, extend this to fetch and update.
 */
export async function refreshPricing(prisma: any): Promise<{ updated: number }> {
  const result = await prisma.aiModelProvider.updateMany({
    where: { isAvailable: true },
    data: { priceUpdatedAt: new Date() },
  });
  return { updated: result.count };
}
