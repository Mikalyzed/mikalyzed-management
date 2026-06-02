// lib/dms/feature-flags.ts
// Centralized env-var feature flags for the DMS migration.
// Read once at module load — flipping requires a Vercel env-var change + redeploy.

const truthy = (v: string | undefined) => v === 'true' || v === '1' || v === 'yes'

/**
 * When true, DMS reader paths resolve through the canonical `Vehicle` table
 * (with absorbed inventory scalars) instead of the legacy `InventoryVehicle`
 * table. Flip to `true` during Sub-phase 0.D after backfill + dual-write
 * window are verified. Default false during 0.A, 0.B, 0.C.
 */
export const DMS_READ_CANONICAL_VEHICLE = truthy(process.env.DMS_READ_CANONICAL_VEHICLE)

export function isCanonicalReadMode(): boolean {
  return DMS_READ_CANONICAL_VEHICLE
}
