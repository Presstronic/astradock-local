import type {
  AstraDockApi,
  EventPage,
  EvidenceDetail,
  EvidenceDetailRequest,
  MonitorChangeEnvelope,
  MonitorCommand,
  MonitorSnapshot,
  MonitorStartResult,
  PublicRuntimeSource,
  RendererEvidenceRow,
  RendererScanResult,
  RendererSettings,
  SettingsSnapshot,
  SourceDiscoveryResult,
  SourceSelectionResult,
  Unsubscribe
} from '../../contracts/rendererApi';

export type RuntimeMonitorClient = Pick<AstraDockApi, 'version' | 'source' | 'monitor' | 'events' | 'settings' | 'diagnostics'>;

export const FALLBACK_SETTINGS: RendererSettings = {
  version: 2,
  theme: 'dark',
  username: '',
  userId: '',
  streamView: 'terminal',
  terminalDensity: 'compact',
  tableDensity: 'default',
  terminalDrawer: 'right',
  tableDrawer: 'bottom',
  retentionDays: 30,
  savedAt: null
};

export function getAstraDockClient(): RuntimeMonitorClient {
  const client = window.astradock;
  if (!client) return createUnavailableClient();
  return client;
}

function createUnavailableClient(): RuntimeMonitorClient {
  const unavailable = async (): Promise<never> => {
    throw Object.assign(new Error('AstraDock desktop services are unavailable.'), {
      code: 'desktop_unavailable',
      retryable: false
    });
  };

  return {
    version: 1,
    source: {
      discover: unavailable as () => Promise<SourceDiscoveryResult>,
      choose: unavailable as () => Promise<SourceSelectionResult | null>,
      select: unavailable as (sourceId: string) => Promise<SourceSelectionResult>,
      openFolder: unavailable as (sourceId: string) => Promise<{ opened: true }>
    },
    monitor: {
      getSnapshot: unavailable as () => Promise<MonitorSnapshot>,
      scan: unavailable as (command?: MonitorCommand) => Promise<RendererScanResult>,
      start: unavailable as (command?: MonitorCommand) => Promise<MonitorStartResult>,
      stop: unavailable as () => Promise<MonitorSnapshot['monitor']>,
      subscribe: (() => (() => undefined)) as (
        listener: (message: MonitorChangeEnvelope) => void,
        options?: { resumeAfter?: number }
      ) => Unsubscribe
    },
    events: {
      query: unavailable as AstraDockApi['events']['query'],
      getEvidenceDetail: unavailable as (request: EvidenceDetailRequest) => Promise<EvidenceDetail>
    },
    settings: {
      get: async () => ({ settings: FALLBACK_SETTINGS, storage: { status: 'initializing', errorCode: null }, activeSourceId: null } as SettingsSnapshot),
      update: async () => ({ settings: FALLBACK_SETTINGS, storage: { status: 'initializing', errorCode: null }, activeSourceId: null } as SettingsSnapshot),
      applyRetention: unavailable as RuntimeMonitorClient['settings']['applyRetention'],
      deleteTelemetry: unavailable as RuntimeMonitorClient['settings']['deleteTelemetry'],
      reset: async () => ({ settings: FALLBACK_SETTINGS, storage: { status: 'initializing', errorCode: null }, activeSourceId: null } as SettingsSnapshot)
    },
    diagnostics: {
      getHealth: unavailable as AstraDockApi['diagnostics']['getHealth']
    }
  };
}

export type { EventPage, EvidenceDetail, MonitorSnapshot, PublicRuntimeSource, RendererEvidenceRow, RendererScanResult };
