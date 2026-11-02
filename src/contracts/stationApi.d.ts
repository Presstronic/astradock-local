export interface StationProfile { label: string; apiBaseUrl: string; clientId: string }
export interface StationCapabilities { catalogRead: boolean; inventoryRead: boolean; inventoryWrite: boolean }
export interface StationConsent extends StationCapabilities { paused: boolean }
export interface StationInventoryItem { id: string; itemId: string; name: string | null; quantity: number; unit: string; location: string | null }
export interface StationInventory { revision: string; environmentKey: string; epoch: string; items: StationInventoryItem[]; lastUpdatedAt: string; stale: boolean }
export interface StationProposal { id: string; status: string; reason: string | null; change: { eventId: string; ruleVersion: string; kind: 'acquire' | 'sale' | 'drop' | 'loss'; itemId: string; quantity: number; unit: 'items'; environmentKey: string; epoch: string; sourceTimestamp: string; ingestedAt: string; gameBuild: string; provenance: 'observed' | 'inferred'; confidence: 'confirmed' | 'high' } }
export interface StationReview { proposalId: string; stage: 1 | 2; challenge: string; before: number; after: number; name: string; unit: string }
export interface StationSnapshot {
  storageAvailable: boolean; adapterAvailable: boolean; adapterMessage: string | null;
  state: string; profile: StationProfile | null;
  session: { displayName: string; roles: string[]; permissions: string[]; capabilities: StationCapabilities; expiresAt: string } | null;
  consent: StationConsent; inventory: StationInventory | null; proposals: StationProposal[];
  operations: { id: string; proposalId: string; status: string; attempts: number; nextAttemptAt: string | null; reason: string | null }[];
  review: StationReview | null;
}
export interface StationApi {
  getSnapshot(): Promise<StationSnapshot>;
  configure(profile: StationProfile): Promise<StationSnapshot>;
  signIn(): Promise<StationSnapshot>; cancelSignIn(): Promise<StationSnapshot>; signOut(): Promise<StationSnapshot>;
  refreshAccess(): Promise<StationSnapshot>; refreshInventory(): Promise<StationSnapshot>;
  updateConsent(patch: Partial<StationConsent>): Promise<StationSnapshot>;
  review(proposalId: string): Promise<StationSnapshot>;
  confirm(proposalId: string, challenge: string): Promise<StationSnapshot>;
  cancel(proposalId: string): Promise<StationSnapshot>; reject(proposalId: string): Promise<StationSnapshot>;
  retry(): Promise<StationSnapshot>;
  resolveItems(ids: string[]): Promise<{ gameId: string; itemId: string | null; name: string | null; status: string; revision: string; expiresAt: string; retrievedAt: string }[]>;
}
