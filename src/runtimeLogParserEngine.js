const { TextDecoder } = require('node:util');
const {
  BUILT_IN_RUNTIME_LOG_PROFILES,
  PROFILE_SCHEMA_VERSION
} = require('./runtimeLogProfiles');
const {
  DEFAULT_UNKNOWN_EVIDENCE_POLICY,
  UnknownEvidenceStore
} = require('./unknownEvidenceStore');
const {
  EVENT_TYPE_REGISTRY,
  createPartitionedIdentity,
  createRuntimeEvent,
  deriveEnvironmentContext,
  deriveSourceInstallationId,
  validateRuntimeEvent
} = require('./contracts/runtimeEvents');
const {
  RuntimeEventOrchestrator,
  buildDedupeKey,
  getRuntimeEventFamilyPolicy
} = require('./runtimeEventOrchestrator');

const DEFAULT_MAX_LINE_BYTES = 64 * 1024;
const DEFAULT_MAX_RECORD_BYTES = 128 * 1024;
const DEFAULT_MAX_CONTINUATION_LINES = 8;
const DEFAULT_DRIFT_MIN_RECORDS = 25;
const DEFAULT_DRIFT_MIN_UNKNOWN_RECORDS = 15;
const DEFAULT_DRIFT_UNKNOWN_RATIO = 0.75;
const UNKNOWN_SOURCE_LOCATION = 'UNKNOWN_SOURCE';
const UNKNOWN_MATCHMAKING_REQUEST = 'UNKNOWN_MATCHMAKING_REQUEST';
const VALID_EXTRACTOR_KINDS = new Set([
  'rememberBuildField',
  'clientBuildObserved',
  'releaseEnvironmentObserved',
  'rememberGameVersion',
  'gameDataVersionObserved',
  'loginStarted',
  'accountAuthenticated',
  'rememberCharacterIdentity',
  'identityObserved',
  'rememberMatchmakingRequest',
  'matchmakingStatusObserved',
  'puJoinRequested',
  'rememberChannelCreated',
  'gameServerConnectionEstablished',
  'puEntered',
  'puDisconnected',
  'rememberFrontendReason',
  'returnedToFrontend',
  'applicationExited',
  'partyCreated',
  'partyLaunchInitiated',
  'partyMemberConnected',
  'jurisdictionEntered',
  'monitoredSpaceEntered',
  'armisticeStateChanged'
]);
const EVENT_TYPE_BY_KIND = Object.freeze({
  clientBuildObserved: 'ClientBuildObserved',
  releaseEnvironmentObserved: 'ReleaseEnvironmentObserved',
  gameDataVersionObserved: 'GameDataVersionObserved',
  loginStarted: 'LoginStarted',
  accountAuthenticated: 'AccountAuthenticated',
  identityObserved: 'IdentityObserved',
  matchmakingStatusObserved: 'MatchmakingStatusObserved',
  puJoinRequested: 'PuJoinRequested',
  gameServerConnectionEstablished: 'GameServerConnectionEstablished',
  puEntered: 'PuEntered',
  puDisconnected: 'PuDisconnected',
  returnedToFrontend: 'ReturnedToFrontend',
  applicationExited: 'ApplicationExited',
  partyCreated: 'PartyCreated',
  partyLaunchInitiated: 'PartyLaunchInitiated',
  partyMemberConnected: 'PartyMemberConnected',
  jurisdictionEntered: 'JurisdictionEntered',
  monitoredSpaceEntered: 'MonitoredSpaceEntered',
  armisticeStateChanged: 'ArmisticeStateChanged'
});

class RuntimeLogLineFramer {
  constructor(options = {}) {
    this.maxLineBytes = options.maxLineBytes || DEFAULT_MAX_LINE_BYTES;
    this.emitEmptyLines = options.emitEmptyLines === true;
    this.decoder = new TextDecoder('utf-8', { fatal: false });
    this.validationDecoder = new TextDecoder('utf-8', { fatal: true });
    this.bufferText = '';
    this.bufferBytes = 0;
    this.nextByteOffset = Number.isInteger(options.sourceByteOffset) ? options.sourceByteOffset : 0;
    this.nextLineNumber = Number.isInteger(options.sourceLineNumber) ? options.sourceLineNumber : 1;
    this.discardingOversizedLine = false;
  }

  push(chunk, metadata = {}) {
    const bytes = toBuffer(chunk);
    const diagnostics = [];
    const lines = [];

    try {
      this.validationDecoder.decode(bytes, { stream: true });
    } catch (_error) {
      diagnostics.push(this.diagnostic('invalid_utf8', 'Invalid UTF-8 bytes were replaced during framing.'));
      this.validationDecoder = new TextDecoder('utf-8', { fatal: true });
    }

    let text = this.decoder.decode(bytes, { stream: true });

    if (this.discardingOversizedLine) {
      const newlineIndex = text.indexOf('\n');
      if (newlineIndex === -1) {
        this.nextByteOffset += bytes.length;
        return { lines, diagnostics };
      }
      const discarded = text.slice(0, newlineIndex + 1);
      this.nextByteOffset += Buffer.byteLength(discarded, 'utf8');
      text = text.slice(newlineIndex + 1);
      this.discardingOversizedLine = false;
    }

    this.bufferText += text;
    this.bufferBytes += bytes.length;

    while (true) {
      const newlineIndex = this.bufferText.indexOf('\n');
      if (newlineIndex === -1) break;

      const physicalLine = this.bufferText.slice(0, newlineIndex + 1);
      this.bufferText = this.bufferText.slice(newlineIndex + 1);

      const lineBytes = Buffer.byteLength(physicalLine, 'utf8');
      const content = physicalLine.replace(/\r?\n$/, '');
      const frame = this.buildLineFrame(content, lineBytes, metadata);
      this.bufferBytes = Math.max(0, this.bufferBytes - lineBytes);

      if (lineBytes > this.maxLineBytes) {
        diagnostics.push(this.diagnostic('line_too_long', 'Complete line exceeded configured byte limit.', frame));
      } else if (content.length > 0 || this.emitEmptyLines) {
        lines.push(frame);
      }
    }

    if (this.bufferBytes > this.maxLineBytes) {
      diagnostics.push(this.diagnostic('line_too_long', 'Incomplete line exceeded configured byte limit and was quarantined.'));
      this.bufferText = '';
      this.bufferBytes = 0;
      this.discardingOversizedLine = true;
    }

    return { lines, diagnostics };
  }

  end(options = {}) {
    const diagnostics = [];
    const lines = [];
    const trailing = this.decoder.decode();
    if (trailing) {
      this.bufferText += trailing;
      this.bufferBytes += Buffer.byteLength(trailing, 'utf8');
    }

    if (this.bufferText.length === 0) return { lines, diagnostics };

    if (options.emitIncompleteLine === true) {
      const frame = this.buildLineFrame(this.bufferText, Buffer.byteLength(this.bufferText, 'utf8'));
      if (frame.byteLength <= this.maxLineBytes) lines.push(frame);
      else diagnostics.push(this.diagnostic('line_too_long', 'Incomplete line exceeded configured byte limit.', frame));
    } else {
      diagnostics.push(this.diagnostic('incomplete_line_retained', 'Incomplete trailing line was retained until more bytes arrive.', {
        sourceByteOffset: this.nextByteOffset,
        lineNumber: this.nextLineNumber
      }));
    }

    this.bufferText = '';
    this.bufferBytes = 0;
    return { lines, diagnostics };
  }

  buildLineFrame(text, byteLength, metadata = {}) {
    const frame = {
      text,
      lineNumber: this.nextLineNumber,
      sourceByteOffset: this.nextByteOffset,
      byteLength
    };
    if (Number.isSafeInteger(metadata.generation)) frame.sourceGeneration = metadata.generation;
    if (Number.isSafeInteger(metadata.sequence)) frame.sourceChunkSequence = metadata.sequence;
    this.nextLineNumber += 1;
    this.nextByteOffset += byteLength;
    return frame;
  }

  diagnostic(code, message, details = {}) {
    return {
      code,
      severity: code === 'invalid_utf8' ? 'error' : 'warn',
      message,
      sourceByteOffset: details.sourceByteOffset,
      lineNumber: details.lineNumber
    };
  }
}

class RuntimeLogRecordAssembler {
  constructor(options = {}) {
    this.maxRecordBytes = options.maxRecordBytes || DEFAULT_MAX_RECORD_BYTES;
    this.maxContinuationLines = options.maxContinuationLines || DEFAULT_MAX_CONTINUATION_LINES;
    this.pending = null;
  }

  pushLine(line) {
    const records = [];
    const diagnostics = [];
    const isContinuation = /^\s+/.test(line.text);

    if (isContinuation && this.pending) {
      this.pending.text = `${this.pending.text}\n${line.text}`;
      this.pending.normalizedText = normalizeRecordText(this.pending.text);
      this.pending.byteLength += line.byteLength;
      this.pending.endLineNumber = line.lineNumber;
      this.pending.lineCount += 1;

      if (this.pending.lineCount > this.maxContinuationLines || this.pending.byteLength > this.maxRecordBytes) {
        diagnostics.push({
          code: 'record_continuation_limit_exceeded',
          severity: 'warn',
          message: 'Multiline record exceeded configured bounds and was quarantined.',
          lineNumber: this.pending.startLineNumber,
          sourceByteOffset: this.pending.sourceByteOffset
        });
        this.pending = null;
      }
      return { records, diagnostics };
    }

    if (isContinuation && !this.pending) {
      diagnostics.push({
        code: 'orphan_continuation_line',
        severity: 'warn',
        message: 'Continuation line arrived without a preceding semantic record.',
        lineNumber: line.lineNumber,
        sourceByteOffset: line.sourceByteOffset
      });
      return { records, diagnostics };
    }

    if (this.pending) records.push(this.pending);
    this.pending = {
      text: line.text,
      normalizedText: normalizeRecordText(line.text),
      startLineNumber: line.lineNumber,
      endLineNumber: line.lineNumber,
      sourceByteOffset: line.sourceByteOffset,
      byteLength: line.byteLength,
      lineCount: 1,
      sourceGeneration: line.sourceGeneration,
      sourceChunkSequence: line.sourceChunkSequence
    };

    return { records, diagnostics };
  }

  end() {
    if (!this.pending) return { records: [], diagnostics: [] };
    const record = this.pending;
    this.pending = null;
    return { records: [record], diagnostics: [] };
  }
}

class RuntimeLogParserEngine {
  constructor(options = {}) {
    const loaded = loadRuntimeLogProfiles(options.profiles || BUILT_IN_RUNTIME_LOG_PROFILES);
    if (!loaded.ok) {
      throw new RuntimeLogProfileValidationError(loaded.errors);
    }

    this.options = {
      sourceLocation: options.sourceLocation || UNKNOWN_SOURCE_LOCATION,
      fixtureId: options.fixtureId,
      ingestedAt: options.ingestedAt,
      sourceProfileId: options.sourceProfileId,
      sourceProfileVersion: options.sourceProfileVersion,
      releaseChannel: options.releaseChannel,
      gameBuild: options.gameBuild,
      branch: options.branch,
      environmentName: options.environmentName,
      rawEnvironmentTag: options.rawEnvironmentTag,
      unknownEvidence: {
        ...DEFAULT_UNKNOWN_EVIDENCE_POLICY,
        ...(options.unknownEvidence || {})
      },
      driftDetection: {
        minRecords: DEFAULT_DRIFT_MIN_RECORDS,
        minUnknownRecords: DEFAULT_DRIFT_MIN_UNKNOWN_RECORDS,
        unknownRatio: DEFAULT_DRIFT_UNKNOWN_RATIO,
        ...(options.driftDetection || {})
      },
      orchestration: options.orchestration || {}
    };
    this.profiles = loaded.profiles;
    this.framerOptions = options.framer || {};
    this.assemblerOptions = options.assembler || {};
    this.framer = new RuntimeLogLineFramer(this.framerOptions);
    this.assembler = new RuntimeLogRecordAssembler(this.assemblerOptions);
    this.orchestrator = options.orchestrator || new RuntimeEventOrchestrator(this.options.orchestration);
    this.currentSourceGeneration = null;
    this.events = [];
    this.diagnostics = [];
    this.unknownEvidenceStore = options.unknownEvidenceStore || new UnknownEvidenceStore({
      policy: this.options.unknownEvidence,
      now: () => this.options.ingestedAt || new Date().toISOString()
    });
    this.ingestionSequence = 0;
    this.stats = {
      recordsSeen: 0,
      literalChecks: 0,
      extractorEvaluations: 0,
      eventsEmitted: 0,
      unknownRecords: 0,
      diagnosticsEmitted: 0
    };
    this.state = {
      sourceLocation: this.options.sourceLocation,
      build: {
        fileVersion: null,
        productVersion: null,
        branch: this.options.branch || null,
        changelist: null,
        gameVersion: this.options.gameBuild || null,
        dataCoreVersion: null,
        archetypeVersion: null,
        componentVersion: null,
        releaseChannel: this.options.releaseChannel || null,
        environmentName: this.options.environmentName || null,
        rawEnvironmentTag: this.options.rawEnvironmentTag || null,
        config: null
      },
      identity: {},
      matchmakingByPort: new Map(),
      channelByEndpoint: new Map(),
      frontendReason: null
    };
    this.environment = this.buildEnvironment(new Date(0).toISOString(), ['parser-engine:initial']);
  }

  push(chunk) {
    const input = normalizeChunkInput(chunk);
    this.applyChunkScope(input);
    const output = this.framer.push(input.bytes, input.metadata);
    this.addDiagnostics(output.diagnostics);
    this.consumeLines(output.lines);
    return this.snapshot({ incremental: true });
  }

  end(options = {}) {
    const output = this.framer.end(options);
    this.addDiagnostics(output.diagnostics);
    this.consumeLines(output.lines);
    const assembled = this.assembler.end();
    this.addDiagnostics(assembled.diagnostics);
    this.consumeRecords(assembled.records);
    return this.snapshot();
  }

  consumeLines(lines) {
    for (const line of lines) {
      const assembled = this.assembler.pushLine(line);
      this.addDiagnostics(assembled.diagnostics);
      this.consumeRecords(assembled.records);
    }
  }

  consumeRecords(records) {
    for (const record of records) {
      this.stats.recordsSeen += 1;
      this.observeEnvironmentEvidence(record);
      const selectedProfile = this.selectProfile(record);

      if (!selectedProfile) {
        this.addUnknownEvidence(record, null, 'unsupported_profile');
        continue;
      }

      const candidates = candidateExtractorsForRecord(selectedProfile, record, this.stats);
      if (candidates.length === 0) {
        this.addUnknownEvidence(record, selectedProfile, 'no_profile_match');
        continue;
      }

      const pendingEvents = [];
      for (const extractor of candidates) {
        this.stats.extractorEvaluations += 1;
        const produced = this.applyExtractor(extractor, selectedProfile, record);
        pendingEvents.push(...produced);
      }
      this.emitNonConflictingEvents(pendingEvents, record, selectedProfile);
    }
  }

  applyChunkScope(input) {
    if (!Number.isSafeInteger(input.metadata.generation)) return;
    if (this.currentSourceGeneration === null) {
      this.currentSourceGeneration = input.metadata.generation;
      if (Number.isSafeInteger(input.metadata.offsetStart) && input.metadata.offsetStart !== this.framer.nextByteOffset) {
        this.framer = new RuntimeLogLineFramer({
          ...this.framerOptions,
          sourceByteOffset: input.metadata.offsetStart
        });
      }
      return;
    }
    if (this.currentSourceGeneration === input.metadata.generation) return;

    const previousGeneration = this.currentSourceGeneration;
    this.currentSourceGeneration = input.metadata.generation;
    this.framer = new RuntimeLogLineFramer({
      ...this.framerOptions,
      sourceByteOffset: Number.isSafeInteger(input.metadata.offsetStart) ? input.metadata.offsetStart : 0
    });
    this.assembler = new RuntimeLogRecordAssembler(this.assemblerOptions);
    this.orchestrator.resetSourceScope({ sourceGeneration: input.metadata.generation });
    this.state.matchmakingByPort.clear();
    this.state.channelByEndpoint.clear();
    this.state.frontendReason = null;
    this.addDiagnostic({
      code: 'source_generation_changed',
      severity: 'warn',
      message: 'Runtime source generation changed; buffered record and bounded correlation state were reset.',
      details: {
        previousGeneration,
        sourceGeneration: input.metadata.generation
      }
    });
  }

  observeEnvironmentEvidence(record) {
    const text = record.normalizedText;
    const timestamp = parseSourceTimestamp(text) || new Date(0).toISOString();
    const build = this.state.build;

    const fileVersion = pickKeyValue(text, 'FileVersion');
    if (fileVersion) {
      build.fileVersion = fileVersion;
      build.gameVersion = build.gameVersion || fileVersion;
    }

    const productVersion = pickKeyValue(text, 'ProductVersion');
    if (productVersion) {
      build.productVersion = productVersion;
      build.gameVersion = build.gameVersion || productVersion;
    }

    const branch = pickKeyValue(text, 'Branch');
    if (branch) build.branch = branch;

    const changelist = pickKeyValue(text, 'Changelist');
    if (changelist) build.changelist = changelist;

    if (text.includes('<Init>')) {
      build.environmentName = pickBracketValue(text, 'Environment') || build.environmentName;
      build.rawEnvironmentTag = pickBracketValue(text, 'Tag') || build.rawEnvironmentTag;
      build.releaseChannel = normalizeReleaseChannel(build.rawEnvironmentTag) || build.releaseChannel;
      build.config = pickBracketValue(text, 'Config') || build.config;
      this.state.sourceLocation = pickBracketValue(text, 'SourcePath') || this.state.sourceLocation;
    }

    if (text.includes('<Game Version>')) {
      build.gameVersion = pickBracketValue(text, 'version') || build.gameVersion;
      const gameEnvironment = pickLastBracketValue(text, 'environment');
      build.rawEnvironmentTag = gameEnvironment || build.rawEnvironmentTag;
      build.releaseChannel = normalizeReleaseChannel(build.rawEnvironmentTag) || build.releaseChannel;
    }

    if (text.includes('<SetDatabaseVersion>')) {
      build.dataCoreVersion = pickBracketValue(text, 'dataCore') || build.dataCoreVersion;
      build.archetypeVersion = pickBracketValue(text, 'archetype') || build.archetypeVersion;
      build.componentVersion = pickBracketValue(text, 'component') || build.componentVersion;
    }

    this.environment = this.buildEnvironment(timestamp, environmentMarkersForRecord(text));
  }

  buildEnvironment(observedAt, markers) {
    const build = this.state.build;
    const sourceLocation = this.state.sourceLocation || UNKNOWN_SOURCE_LOCATION;
    const releaseChannel = build.releaseChannel ||
      normalizeReleaseChannel(this.options.releaseChannel) ||
      inferReleaseChannelFromSourceLocation(sourceLocation) ||
      'UNKNOWN';

    return deriveEnvironmentContext({
      releaseChannel,
      universe: 'PU',
      environmentName: build.environmentName || this.options.environmentName || 'UNKNOWN',
      rawEnvironmentTag: build.rawEnvironmentTag || releaseChannel,
      branch: build.branch || this.options.branch || 'UNKNOWN',
      buildVersion: build.gameVersion || build.fileVersion || this.options.gameBuild || 'UNKNOWN_BUILD',
      changelist: build.changelist || undefined,
      databaseVersion: build.dataCoreVersion || undefined,
      sourceInstallationId: deriveSourceInstallationId(sourceLocation),
      observedAt,
      evidenceReference: {
        kind: this.options.fixtureId ? 'fixture' : 'runtime_log',
        sourceId: deriveSourceInstallationId(sourceLocation),
        fixtureId: this.options.fixtureId,
        sensitivity: 'local',
        evidenceMarkers: markers,
        lineRange: {
          start: 0,
          end: 0
        }
      }
    });
  }

  selectProfile(record) {
    const explicitId = this.options.sourceProfileId;
    const candidates = explicitId
      ? this.profiles.filter((profile) => profile.id === explicitId)
      : this.profiles;
    const compatible = candidates.filter((profile) => isProfileCompatible(profile, this.environment));

    if (compatible.length === 0) {
      this.addDiagnostic({
        code: 'unsupported_profile',
        severity: 'warn',
        message: 'No extraction profile is compatible with the current environment evidence.',
        lineNumber: record.startLineNumber,
        sourceByteOffset: record.sourceByteOffset,
        details: {
          requestedProfileId: explicitId || null,
          releaseChannel: this.environment.releaseChannel,
          gameBuild: this.environment.buildVersion
        }
      });
      return null;
    }

    return compatible[0];
  }

  applyExtractor(extractor, profile, record) {
    switch (extractor.kind) {
      case 'rememberBuildField':
        this.state.build[extractor.field] = pickKeyValue(record.normalizedText, profileFieldKey(extractor.field)) ||
          this.state.build[extractor.field];
        return [];
      case 'clientBuildObserved':
        this.state.build.changelist = pickKeyValue(record.normalizedText, 'Changelist') || this.state.build.changelist;
        return this.createEventIfComplete('ClientBuildObserved', {
          fileVersion: this.state.build.fileVersion,
          productVersion: this.state.build.productVersion,
          branch: this.state.build.branch,
          changelist: this.state.build.changelist
        }, extractor, profile, record, ['fileVersion', 'productVersion', 'branch', 'changelist']);
      case 'releaseEnvironmentObserved': {
        const payload = {
          releaseChannel: normalizeReleaseChannel(pickBracketValue(record.normalizedText, 'Tag')) || this.environment.releaseChannel,
          environmentName: pickBracketValue(record.normalizedText, 'Environment'),
          config: pickBracketValue(record.normalizedText, 'Config'),
          sourceLocation: pickBracketValue(record.normalizedText, 'SourcePath') || this.state.sourceLocation
        };
        return this.createEventIfComplete('ReleaseEnvironmentObserved', payload, extractor, profile, record);
      }
      case 'rememberGameVersion':
        this.state.build.gameVersion = pickBracketValue(record.normalizedText, 'version') || this.state.build.gameVersion;
        return [];
      case 'gameDataVersionObserved':
        this.state.build.dataCoreVersion = pickBracketValue(record.normalizedText, 'dataCore') || this.state.build.dataCoreVersion;
        this.state.build.archetypeVersion = pickBracketValue(record.normalizedText, 'archetype') || this.state.build.archetypeVersion;
        this.state.build.componentVersion = pickBracketValue(record.normalizedText, 'component') || this.state.build.componentVersion;
        return this.createEventIfComplete('GameDataVersionObserved', {
          gameVersion: this.state.build.gameVersion,
          dataCoreVersion: this.state.build.dataCoreVersion,
          archetypeVersion: this.state.build.archetypeVersion,
          componentVersion: this.state.build.componentVersion
        }, extractor, profile, record);
      case 'loginStarted':
        return this.createEventIfComplete('LoginStarted', {
          loginSessionId: pickKeyValue(record.normalizedText, 'LoginSessionId'),
          releaseChannel: normalizeReleaseChannel(pickBracketValue(record.normalizedText, 'releaseChannel')) || this.environment.releaseChannel
        }, extractor, profile, record);
      case 'accountAuthenticated': {
        const payload = {
          handle: pickBracketValue(record.normalizedText, 'handle'),
          accountId: pickBracketValue(record.normalizedText, 'accountId')
        };
        Object.assign(this.state.identity, payload);
        return this.createEventIfComplete('AccountAuthenticated', payload, extractor, profile, record);
      }
      case 'rememberCharacterIdentity':
        Object.assign(this.state.identity, {
          characterName: pickKeyValue(record.normalizedText, 'name'),
          accountId: pickKeyValue(record.normalizedText, 'accountId') || this.state.identity.accountId,
          characterGeid: pickKeyValue(record.normalizedText, 'geid')
        });
        return [];
      case 'identityObserved': {
        const payload = {
          characterName: this.state.identity.characterName || pickQuotedKeyValue(record.normalizedText, 'nickname'),
          accountId: this.state.identity.accountId,
          characterGeid: this.state.identity.characterGeid,
          playerGeid: pickKeyValue(record.normalizedText, 'playerGEID'),
          nodeId: pickKeyValue(record.normalizedText, 'node_id'),
          clientSession: pickKeyValue(record.normalizedText, 'session')
        };
        Object.assign(this.state.identity, payload);
        return this.createEventIfComplete('IdentityObserved', payload, extractor, profile, record);
      }
      case 'rememberMatchmakingRequest':
      case 'matchmakingStatusObserved': {
        const request = {
          id: pickBracketValue(record.normalizedText, 'id'),
          status: pickBracketValue(record.normalizedText, 'status'),
          port: toInteger(pickBracketValue(record.normalizedText, 'port'))
        };
        if (request.port) this.state.matchmakingByPort.set(String(request.port), request);
        if (extractor.kind === 'rememberMatchmakingRequest') return [];
        return this.createEventIfComplete('MatchmakingStatusObserved', {
          matchmakingRequestId: request.id,
          matchmakingStatus: request.status,
          port: request.port
        }, extractor, profile, record);
      }
      case 'puJoinRequested': {
        const port = toInteger(pickBracketValue(record.normalizedText, 'port'));
        const request = this.state.matchmakingByPort.get(String(port));
        return this.createEventIfComplete('PuJoinRequested', {
          matchmakingRequestId: request?.id || UNKNOWN_MATCHMAKING_REQUEST,
          shard: pickBracketValue(record.normalizedText, 'shard'),
          endpoint: pickBracketValue(record.normalizedText, 'address'),
          port,
          locationId: pickBracketValue(record.normalizedText, 'locationId')
        }, extractor, profile, record);
      }
      case 'rememberChannelCreated': {
        const channel = channelPayload(record.normalizedText);
        if (channel.endpoint) this.state.channelByEndpoint.set(channel.endpoint, channel);
        return [];
      }
      case 'gameServerConnectionEstablished': {
        const connection = channelPayload(record.normalizedText);
        const created = this.state.channelByEndpoint.get(connection.endpoint);
        return this.createEventIfComplete('GameServerConnectionEstablished', {
          endpoint: connection.endpoint,
          port: connection.port,
          nodeId: connection.nodeId || created?.nodeId,
          playerGeid: created?.playerGeid,
          gamerules: connection.gamerules
        }, extractor, profile, record);
      }
      case 'puEntered':
        return this.createEventIfComplete('PuEntered', {
          gamerules: pickKeyValue(record.normalizedText, 'rules'),
          loadDurationSeconds: toNumber(pickKeyValue(record.normalizedText, 'elapsedSecs'))
        }, extractor, profile, record);
      case 'puDisconnected': {
        const disconnect = channelPayload(record.normalizedText);
        return this.createEventIfComplete('PuDisconnected', {
          cause: pickKeyValue(record.normalizedText, 'cause'),
          reason: pickKeyValue(record.normalizedText, 'reason'),
          isRemote: toBoolean(pickKeyValue(record.normalizedText, 'isRemote')),
          endpoint: disconnect.endpoint,
          uptimeSeconds: toNumber(pickKeyValue(record.normalizedText, 'uptime_secs'))
        }, extractor, profile, record);
      }
      case 'rememberFrontendReason':
        this.state.frontendReason = pickKeyValue(record.normalizedText, 'RequestFrontEndReason');
        return [];
      case 'returnedToFrontend': {
        const channel = channelPayload(record.normalizedText);
        if (!channel.endpoint || !channel.endpoint.includes('frontend')) return [];
        return this.createEventIfComplete('ReturnedToFrontend', {
          reason: this.state.frontendReason
        }, extractor, profile, record);
      }
      case 'applicationExited':
        return this.createEventIfComplete('ApplicationExited', {
          cause: pickKeyValue(record.normalizedText, 'cause'),
          reason: pickKeyValue(record.normalizedText, 'reason'),
          exitCode: toInteger(pickKeyValue(record.normalizedText, 'exitCode')),
          clean: toInteger(pickKeyValue(record.normalizedText, 'exitCode')) === 0
        }, extractor, profile, record);
      case 'partyCreated':
        return this.createEventIfComplete('PartyCreated', {
          partyId: pickBracketValue(record.normalizedText, 'partyId'),
          leaderHandle: pickBracketValue(record.normalizedText, 'leader')
        }, extractor, profile, record);
      case 'partyLaunchInitiated':
        return this.createEventIfComplete('PartyLaunchInitiated', {
          notificationId: pickBracketValue(record.normalizedText, 'NotificationId'),
          message: pickNotificationMessage(record.normalizedText)
        }, extractor, profile, record);
      case 'partyMemberConnected': {
        const message = pickNotificationMessage(record.normalizedText);
        const member = message && message.match(/^(?<member>.+?) connected\.$/);
        if (!member) return [];
        return this.createEventIfComplete('PartyMemberConnected', {
          notificationId: pickBracketValue(record.normalizedText, 'NotificationId'),
          memberHandle: member.groups.member
        }, extractor, profile, record);
      }
      case 'jurisdictionEntered': {
        const message = pickNotificationMessage(record.normalizedText);
        const jurisdiction = message && message.match(/^Entered (?<jurisdiction>.+?) Jurisdiction$/);
        if (!jurisdiction) return [];
        return this.createEventIfComplete('JurisdictionEntered', {
          notificationId: pickBracketValue(record.normalizedText, 'NotificationId'),
          jurisdiction: jurisdiction.groups.jurisdiction
        }, extractor, profile, record);
      }
      case 'monitoredSpaceEntered':
        return this.createEventIfComplete('MonitoredSpaceEntered', {
          notificationId: pickBracketValue(record.normalizedText, 'NotificationId'),
          state: 'entered'
        }, extractor, profile, record);
      case 'armisticeStateChanged':
        return this.createEventIfComplete('ArmisticeStateChanged', {
          notificationId: pickBracketValue(record.normalizedText, 'NotificationId'),
          state: extractor.state
        }, extractor, profile, record);
      default:
        this.addDiagnostic({
          code: 'unknown_extractor_kind',
          severity: 'error',
          message: 'Profile extractor kind is not implemented.',
          lineNumber: record.startLineNumber,
          sourceByteOffset: record.sourceByteOffset,
          details: {
            extractorId: extractor.id
          }
        });
        return [];
    }
  }

  createEventIfComplete(eventType, payload, extractor, profile, record, requiredFields) {
    const required = requiredFields || extractor.requiredFields || Object.keys(EVENT_TYPE_REGISTRY[eventType]?.payload || {});
    const missing = required.filter((field) => payload[field] === null || payload[field] === undefined || payload[field] === '');
    if (missing.length > 0) {
      this.addDiagnostic({
        code: 'missing_required_fields',
        severity: 'warn',
        message: 'Extractor matched but required fields were not available.',
        lineNumber: record.startLineNumber,
        sourceByteOffset: record.sourceByteOffset,
        details: {
          profileId: profile.id,
          extractorId: extractor.id,
          eventType,
          missing
        }
      });
      this.addUnknownEvidence(record, profile, 'matched_missing_required_fields', {
        evidenceMarkers: extractor.evidenceMarkers,
        sensitivity: extractor.sensitivity || 'local'
      });
      return [];
    }

    const policy = getRuntimeEventFamilyPolicy(eventType, extractor, this.options.orchestration);
    const dedupeKey = buildDedupeKey(this.environment.environmentKey, eventType, payload, policy.dedupeFields);

    const sourceTimestamp = parseSourceTimestamp(record.normalizedText) || this.environment.observedAt;
    const sourceLocation = this.state.sourceLocation || this.options.sourceLocation || UNKNOWN_SOURCE_LOCATION;
    const sourceId = deriveSourceInstallationId(sourceLocation);
    const event = {
      eventType,
      sourceTimestamp,
      ingestedAt: this.options.ingestedAt || sourceTimestamp,
      environmentKey: this.environment.environmentKey,
      environment: this.environment,
      gameChannel: this.environment.releaseChannel,
      gameBuild: this.environment.buildVersion,
      sourceLocation,
      sourceProfileId: profile.id,
      sourceProfileVersion: this.options.sourceProfileVersion || profile.version,
      parserVersion: profile.parserVersion,
      provenance: 'observed',
      confidence: extractor.confidence || 'medium',
      correlationIds: buildCorrelationIds(this.environment.environmentKey, eventType, dedupeKey, payload),
      ordering: {
        ingestionSequence: this.orchestrator.ingestionSequence + 1,
        sourceSequence: record.startLineNumber,
        sourceByteOffset: record.sourceByteOffset,
        ...(Number.isSafeInteger(record.sourceGeneration) ? { sourceGeneration: record.sourceGeneration } : {}),
        ...(Number.isSafeInteger(record.sourceChunkSequence) ? { sourceChunkSequence: record.sourceChunkSequence } : {})
      },
      payload,
      evidenceReference: {
        kind: this.options.fixtureId ? 'fixture' : 'runtime_log',
        sourceId,
        fixtureId: this.options.fixtureId,
        sensitivity: extractor.sensitivity || 'local',
        evidenceMarkers: extractor.evidenceMarkers,
        lineRange: {
          start: record.startLineNumber,
          end: record.endLineNumber
        }
      }
    };

    let validation;
    try {
      validation = validateRuntimeEvent(createRuntimeEvent(event));
    } catch (validationError) {
      const errors = validationError.errors || [{ code: 'event_validation_exception' }];
      this.addDiagnostic({
        code: 'event_validation_failed',
        severity: 'error',
        message: 'Extractor output failed runtime-event/v1 validation.',
        lineNumber: record.startLineNumber,
        sourceByteOffset: record.sourceByteOffset,
        details: {
          eventType,
          errors: errors.map((error) => error.code)
        }
      });
      return [];
    }
    if (!validation.ok) {
      this.addDiagnostic({
        code: 'event_validation_failed',
        severity: 'error',
        message: 'Extractor output failed runtime-event/v1 validation.',
        lineNumber: record.startLineNumber,
        sourceByteOffset: record.sourceByteOffset,
        details: {
          eventType,
          errors: validation.errors.map((error) => error.code)
        }
      });
      return [];
    }

    return [{ event: validation.event, dedupeKey, extractorId: extractor.id, extractor, policy }];
  }

  emitNonConflictingEvents(pendingEvents, record, selectedProfile) {
    const result = this.orchestrator.processRecord({
      candidates: pendingEvents,
      record,
      selectedProfile
    });
    this.addDiagnostics(result.diagnostics);
    for (const capture of result.unknownEvidence) {
      this.addUnknownEvidence(record, selectedProfile || this.selectProfileSnapshot(), capture.reason, {
        evidenceMarkers: capture.evidenceMarkers,
        sensitivity: capture.sensitivity
      });
    }
    for (const event of result.emitted) {
      this.ingestionSequence = event.ordering.ingestionSequence;
      this.events.push(event);
      this.stats.eventsEmitted += 1;
    }
  }

  addUnknownEvidence(record, profile, reason, overrides = {}) {
    this.stats.unknownRecords += 1;
    this.unknownEvidenceStore.capture({
      reason,
      text: record.normalizedText,
      environmentKey: this.environment.environmentKey,
      releaseChannel: this.environment.releaseChannel,
      gameBuild: this.environment.buildVersion,
      sourceProfileId: profile?.id || null,
      sourceProfileVersion: profile?.version || null,
      parserVersion: profile?.parserVersion || this.selectProfileSnapshot()?.parserVersion || 'runtime-log-parser/0.1.0',
      sourceTimestamp: parseSourceTimestamp(record.normalizedText),
      lineRange: {
        start: record.startLineNumber,
        end: record.endLineNumber
      },
      sourceByteOffset: record.sourceByteOffset,
      evidenceMarkers: overrides.evidenceMarkers || classifyUnknownEvidence(record.normalizedText),
      sensitivity: overrides.sensitivity || 'local',
      observedAt: this.options.ingestedAt || parseSourceTimestamp(record.normalizedText) || new Date().toISOString()
    });
  }

  addDiagnostics(diagnostics) {
    for (const diagnostic of diagnostics) this.addDiagnostic(diagnostic);
  }

  addDiagnostic(diagnostic) {
    this.diagnostics.push(diagnostic);
    this.stats.diagnosticsEmitted += 1;
  }

  snapshot() {
    const selectedProfile = this.selectProfileSnapshot();
    const unknownEvidenceSummary = this.unknownEvidenceStore.getSummary();
    const parserHealth = this.getParserHealth({ selectedProfile, unknownEvidenceSummary });
    return {
      events: this.events.slice(),
      diagnostics: this.diagnostics.slice(),
      healthEvents: this.createParserHealthEvents(parserHealth, selectedProfile),
      unknownEvidence: this.queryUnknownEvidence({ limit: 100 }).items,
      unknownEvidenceSummary,
      parserHealth,
      environment: this.environment,
      selectedProfile,
      parserVersion: selectedProfile?.parserVersion || 'runtime-log-parser/0.1.0',
      orchestration: {
        stats: this.orchestrator.getStats(),
        decisions: this.orchestrator.getRecentDecisions()
      },
      stats: { ...this.stats }
    };
  }

  queryUnknownEvidence(query = {}) {
    return this.unknownEvidenceStore.query(query);
  }

  deleteUnknownEvidence(scope = {}) {
    return this.unknownEvidenceStore.delete(scope);
  }

  resetUnknownEvidence() {
    return this.unknownEvidenceStore.reset();
  }

  getParserHealth(input = {}) {
    const selectedProfile = input.selectedProfile || this.selectProfileSnapshot();
    const unknownEvidenceSummary = input.unknownEvidenceSummary || this.unknownEvidenceStore.getSummary();
    const unsupportedProfile = this.diagnostics.some((diagnostic) => diagnostic.code === 'unsupported_profile');
    const recordsSeen = this.stats.recordsSeen;
    const unknownRecords = unknownEvidenceSummary.recordCount;
    const unknownRatio = recordsSeen > 0 ? unknownRecords / recordsSeen : 0;
    const driftPolicy = this.options.driftDetection;
    const suspectedDrift = !unsupportedProfile &&
      selectedProfile &&
      recordsSeen >= driftPolicy.minRecords &&
      unknownRecords >= driftPolicy.minUnknownRecords &&
      unknownRatio >= driftPolicy.unknownRatio;
    const status = unsupportedProfile
      ? 'unsupported_profile'
      : suspectedDrift
        ? 'suspected_drift'
        : selectedProfile
          ? 'compatible'
          : 'unsupported_profile';
    const reason = unsupportedProfile
      ? 'no_compatible_profile'
      : suspectedDrift
        ? 'high_unknown_ratio'
        : 'profile_compatible';

    return {
      status,
      reason,
      checkedAt: this.options.ingestedAt || new Date().toISOString(),
      profileId: selectedProfile?.id || this.options.sourceProfileId || 'unsupported_profile',
      profileVersion: selectedProfile?.version || this.options.sourceProfileVersion || 'unknown',
      parserVersion: selectedProfile?.parserVersion || 'runtime-log-parser/0.1.0',
      recordsSeen,
      knownEventsEmitted: this.stats.eventsEmitted,
      unknownRecords,
      unknownRatio,
      unknownSampleCount: unknownEvidenceSummary.sampleCount,
      droppedUnknownSamples: unknownEvidenceSummary.droppedSampleCount,
      affectedEnvironmentKey: this.environment.environmentKey,
      gameBuild: this.environment.buildVersion,
      releaseChannel: this.environment.releaseChannel
    };
  }

  createParserHealthEvents(parserHealth, selectedProfile) {
    const events = [];
    const profile = selectedProfile || {
      id: parserHealth.profileId,
      version: parserHealth.profileVersion,
      parserVersion: parserHealth.parserVersion
    };
    events.push(this.createParserHealthEvent('ParserCompatibilityStatusObserved', {
      status: parserHealth.status,
      profileId: parserHealth.profileId,
      profileVersion: parserHealth.profileVersion,
      reason: parserHealth.reason,
      recordsSeen: parserHealth.recordsSeen,
      knownEventsEmitted: parserHealth.knownEventsEmitted,
      unknownRecords: parserHealth.unknownRecords,
      unknownSampleCount: parserHealth.unknownSampleCount,
      droppedUnknownSamples: parserHealth.droppedUnknownSamples
    }, profile, parserHealth, ['parser-health:compatibility']));

    if (parserHealth.status === 'suspected_drift') {
      events.push(this.createParserHealthEvent('ParserDriftSuspected', {
        profileId: parserHealth.profileId,
        profileVersion: parserHealth.profileVersion,
        reason: parserHealth.reason,
        recordsSeen: parserHealth.recordsSeen,
        knownEventsEmitted: parserHealth.knownEventsEmitted,
        unknownRecords: parserHealth.unknownRecords,
        unknownRatio: Number(parserHealth.unknownRatio.toFixed(6))
      }, profile, parserHealth, ['parser-health:drift']));
    }

    return events.filter(Boolean);
  }

  createParserHealthEvent(eventType, payload, profile, parserHealth, markers) {
    const sourceTimestamp = parserHealth.checkedAt;
    const sourceLocation = this.state.sourceLocation || this.options.sourceLocation || UNKNOWN_SOURCE_LOCATION;
    const sourceId = deriveSourceInstallationId(sourceLocation);
    const orderingBase = this.ingestionSequence + (eventType === 'ParserDriftSuspected' ? 2 : 1);
    try {
      return createRuntimeEvent({
        eventType,
        sourceTimestamp,
        ingestedAt: sourceTimestamp,
        environmentKey: this.environment.environmentKey,
        environment: this.environment,
        gameChannel: this.environment.releaseChannel,
        gameBuild: this.environment.buildVersion,
        sourceLocation,
        sourceProfileId: profile.id || 'unsupported_profile',
        sourceProfileVersion: profile.version || 'unknown',
        parserVersion: profile.parserVersion || 'runtime-log-parser/0.1.0',
        provenance: 'observed',
        confidence: parserHealth.status === 'compatible' ? 'high' : 'medium',
        correlationIds: {
          environmentSessionId: createPartitionedIdentity(this.environment.environmentKey, 'environment_session', ['runtime-log-parser']),
          parserHealthId: createPartitionedIdentity(this.environment.environmentKey, 'parser_health', [
            eventType,
            payload.profileId,
            payload.profileVersion,
            payload.status || payload.reason,
            String(payload.recordsSeen),
            String(payload.unknownRecords)
          ])
        },
        ordering: {
          ingestionSequence: orderingBase,
          sourceSequence: this.stats.recordsSeen
        },
        payload,
        evidenceReference: {
          kind: 'diagnostic',
          sourceId,
          sensitivity: 'local',
          evidenceMarkers: markers
        }
      });
    } catch (error) {
      this.addDiagnostic({
        code: 'parser_health_event_validation_failed',
        severity: 'error',
        message: 'Parser health event failed runtime-event/v1 validation.',
        details: {
          eventType,
          errorCount: error.errors?.length || 1
        }
      });
      return null;
    }
  }

  selectProfileSnapshot() {
    const compatible = this.profiles.filter((profile) => (
      (!this.options.sourceProfileId || profile.id === this.options.sourceProfileId) &&
      isProfileCompatible(profile, this.environment)
    ));
    return compatible[0] || null;
  }
}

class RuntimeLogProfileValidationError extends Error {
  constructor(errors) {
    super(`Runtime log profile validation failed: ${errors.map((error) => error.code).join(', ')}`);
    this.name = 'RuntimeLogProfileValidationError';
    this.errors = errors;
  }
}

function parseRuntimeLogText(text, options = {}) {
  const engine = new RuntimeLogParserEngine(options);
  if (Array.isArray(options.chunkSizes) && options.chunkSizes.length > 0) {
    let offset = 0;
    let chunkIndex = 0;
    const buffer = Buffer.from(String(text), 'utf8');
    while (offset < buffer.length) {
      const size = options.chunkSizes[chunkIndex % options.chunkSizes.length];
      engine.push(buffer.subarray(offset, Math.min(buffer.length, offset + size)));
      offset += size;
      chunkIndex += 1;
    }
  } else {
    engine.push(Buffer.from(String(text), 'utf8'));
  }
  return engine.end(options.endOptions || {});
}

function loadRuntimeLogProfiles(profileInputs) {
  const errors = [];
  const profiles = [];
  const profileIds = new Set();

  for (const [index, profile] of profileInputs.entries()) {
    const path = `$[${index}]`;
    if (!isPlainObject(profile)) {
      errors.push(error('invalid_profile', path, 'Profile must be an object.'));
      continue;
    }

    validateRequired(profile.id, `${path}.id`, 'required_profile_id', errors);
    validateRequired(profile.version, `${path}.version`, 'required_profile_version', errors);
    if (profile.schemaVersion !== PROFILE_SCHEMA_VERSION) {
      errors.push(error('unsupported_profile_schema', `${path}.schemaVersion`, 'Unsupported profile schema version.'));
    }
    if (profileIds.has(profile.id)) {
      errors.push(error('duplicate_profile_id', `${path}.id`, 'Profile IDs must be unique.'));
    }
    profileIds.add(profile.id);

    if (!isPlainObject(profile.compatibility)) {
      errors.push(error('invalid_profile_compatibility', `${path}.compatibility`, 'Profile compatibility metadata is required.'));
    } else {
      if (!stringArray(profile.compatibility.releaseChannels)) {
        errors.push(error('invalid_release_channels', `${path}.compatibility.releaseChannels`, 'Release channels must be strings.'));
      }
      if (!stringArray(profile.compatibility.gameBuildPrefixes)) {
        errors.push(error('invalid_game_build_prefixes', `${path}.compatibility.gameBuildPrefixes`, 'Game-build prefixes must be strings.'));
      }
    }

    if (!stringArray(profile.knownLimitations)) {
      errors.push(error('invalid_known_limitations', `${path}.knownLimitations`, 'Known limitations must be explicit strings.'));
    }
    validateFieldAliases(profile.fieldAliases, `${path}.fieldAliases`, errors);
    if (!Array.isArray(profile.extractors) || profile.extractors.length === 0) {
      errors.push(error('missing_extractors', `${path}.extractors`, 'Profile must define extractors.'));
      continue;
    }

    const extractorIds = new Set();
    for (const [extractorIndex, extractor] of profile.extractors.entries()) {
      const extractorPath = `${path}.extractors[${extractorIndex}]`;
      if (!isPlainObject(extractor)) {
        errors.push(error('invalid_extractor', extractorPath, 'Extractor must be an object.'));
        continue;
      }
      validateRequired(extractor.id, `${extractorPath}.id`, 'required_extractor_id', errors);
      if (extractorIds.has(extractor.id)) {
        errors.push(error('duplicate_extractor_id', `${extractorPath}.id`, 'Extractor IDs must be unique per profile.'));
      }
      extractorIds.add(extractor.id);
      if (!VALID_EXTRACTOR_KINDS.has(extractor.kind)) {
        errors.push(error('invalid_extractor_kind', `${extractorPath}.kind`, 'Extractor kind is not supported.'));
      }
      if (!stringArray(extractor.literals) || extractor.literals.length === 0) {
        errors.push(error('invalid_dispatch_literals', `${extractorPath}.literals`, 'Extractor must define cheap dispatch literals.'));
      }

      const expectedEventType = EVENT_TYPE_BY_KIND[extractor.kind];
      if (expectedEventType && !EVENT_TYPE_REGISTRY[expectedEventType]) {
        errors.push(error('unknown_event_type', `${extractorPath}.eventType`, 'Extractor maps to an unknown runtime event type.'));
      }
      if (expectedEventType) {
        if (extractor.eventType !== expectedEventType) {
          errors.push(error('invalid_event_mapping', `${extractorPath}.eventType`, 'Extractor event mapping must match its reviewed kind.'));
        }
        if (!stringArray(extractor.requiredFields) || extractor.requiredFields.length === 0) {
          errors.push(error('invalid_required_fields', `${extractorPath}.requiredFields`, 'Event extractors must declare required fields.'));
        } else {
          for (const field of extractor.requiredFields) {
            if (!EVENT_TYPE_REGISTRY[expectedEventType].payload[field]) {
              errors.push(error('unknown_required_field', `${extractorPath}.requiredFields`, 'Required field is not in the event payload contract.'));
            }
          }
        }
      } else if (Object.hasOwn(extractor, 'eventType') || Object.hasOwn(extractor, 'requiredFields')) {
        errors.push(error('state_extractor_event_metadata', extractorPath, 'State-only extractors must not declare event metadata.'));
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  for (const profile of profileInputs) {
    profiles.push({
      ...profile,
      extractors: profile.extractors.map((extractor) => ({ ...extractor }))
    });
  }

  profiles.sort((left, right) => (
    (right.priority || 0) - (left.priority || 0) ||
    left.id.localeCompare(right.id) ||
    left.version.localeCompare(right.version)
  ));

  return { ok: true, profiles };
}

function candidateExtractorsForRecord(profile, record, stats) {
  const text = record.normalizedText;
  return profile.extractors.filter((extractor) => {
    stats.literalChecks += extractor.literals.length;
    return extractor.literals.every((literal) => text.includes(literal));
  });
}

function isProfileCompatible(profile, environment) {
  const channels = profile.compatibility.releaseChannels;
  const buildPrefixes = profile.compatibility.gameBuildPrefixes;
  return channels.includes(environment.releaseChannel) &&
    buildPrefixes.some((prefix) => environment.buildVersion.startsWith(prefix));
}

function buildCorrelationIds(environmentKey, eventType, dedupeKey, payload = {}) {
  const ids = {
    environmentSessionId: createPartitionedIdentity(environmentKey, 'environment_session', ['runtime-log-parser']),
    eventDedupeId: dedupeKey,
    eventFamilyId: createPartitionedIdentity(environmentKey, 'event_family', [eventType])
  };
  const add = (key, namespace, parts) => {
    if (parts.every((part) => part !== null && part !== undefined && part !== '')) {
      ids[key] = createPartitionedIdentity(environmentKey, namespace, parts);
    }
  };

  add('loginSessionId', 'login_session', [payload.loginSessionId]);
  add('localAccountId', 'local_account', [payload.accountId]);
  add('clientSessionId', 'client_session', [payload.clientSession]);
  add('matchmakingRequestId', 'matchmaking_request', [payload.matchmakingRequestId]);
  add('serverConnectionId', 'server_connection', [payload.endpoint, payload.port, payload.nodeId, payload.gamerules]);
  add('partyId', 'party', [payload.partyId]);
  add('notificationId', 'notification', [payload.notificationId]);
  add('buildFingerprintId', 'build_fingerprint', [
    payload.fileVersion || payload.gameVersion,
    payload.productVersion || payload.dataCoreVersion,
    payload.branch || payload.archetypeVersion,
    payload.changelist || payload.componentVersion
  ]);
  return ids;
}

function channelPayload(text) {
  const remoteAddr = pickKeyValue(text, 'remoteAddr');
  const parsedEndpoint = parseEndpointPort(remoteAddr);
  return {
    endpoint: parsedEndpoint.endpoint,
    port: parsedEndpoint.port,
    nodeId: pickKeyValue(text, 'node_id'),
    playerGeid: pickKeyValue(text, 'playerGEID'),
    gamerules: pickKeyValue(text, 'gamerules')
  };
}

function parseEndpointPort(value) {
  if (!value) return {};
  const match = String(value).match(/^(?<endpoint>.+):(?<port>\d{1,5})$/);
  if (!match) return { endpoint: String(value) };
  return {
    endpoint: match.groups.endpoint,
    port: toInteger(match.groups.port)
  };
}

function pickNotificationMessage(text) {
  const bracket = pickBracketValue(text, 'Message');
  if (bracket) return bracket.replace(/^"|"$/g, '');
  const quoted = text.match(/\bMessage="(?<value>[^"]+)"/);
  return quoted?.groups?.value || null;
}

function pickBracketValue(text, key) {
  const escaped = escapeRegExp(key);
  const match = String(text).match(new RegExp(`\\b${escaped}\\[([^\\]]+)\\]`, 'i'));
  return match ? cleanValue(match[1]) : null;
}

function pickLastBracketValue(text, key) {
  const escaped = escapeRegExp(key);
  const matches = Array.from(String(text).matchAll(new RegExp(`\\b${escaped}\\[([^\\]]+)\\]`, 'gi')));
  const match = matches.at(-1);
  return match ? cleanValue(match[1]) : null;
}

function pickKeyValue(text, key) {
  const escaped = escapeRegExp(key);
  const patterns = [
    new RegExp(`\\b${escaped}\\b\\s*[:=]\\s*"(?<value>[^"]+)"`, 'i'),
    new RegExp(`\\b${escaped}\\b\\s*[:=]\\s*(?<value>[^\\s,\\]]+)`, 'i'),
    new RegExp(`\\b${escaped}\\b\\s+(?<value>[^\\s,\\]]+)`, 'i')
  ];

  for (const pattern of patterns) {
    const match = String(text).match(pattern);
    if (match?.groups?.value) return cleanValue(match.groups.value);
  }
  return null;
}

function pickQuotedKeyValue(text, key) {
  const escaped = escapeRegExp(key);
  const match = String(text).match(new RegExp(`\\b${escaped}\\b\\s*=\\s*"(?<value>[^"]+)"`, 'i'));
  return match?.groups?.value ? cleanValue(match.groups.value) : null;
}

function parseSourceTimestamp(text) {
  const match = String(text).match(/<(?<timestamp>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)>/);
  if (!match) return null;
  const parsed = new Date(match.groups.timestamp.endsWith('Z') ? match.groups.timestamp : `${match.groups.timestamp}Z`);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function normalizeRecordText(text) {
  return String(text).replace(/\s*\n\s*/g, ' ').trimEnd();
}

function normalizeReleaseChannel(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return ['LIVE', 'PTU', 'EPTU', 'HOTFIX'].includes(normalized) ? normalized : null;
}

function inferReleaseChannelFromSourceLocation(sourceLocation) {
  const normalized = String(sourceLocation || '').replace(/\\/g, '/');
  return normalized.split('/')
    .map((part) => part.trim().toUpperCase())
    .find((part) => ['LIVE', 'PTU', 'EPTU', 'HOTFIX'].includes(part)) || null;
}

function environmentMarkersForRecord(text) {
  const markers = [];
  for (const literal of ['FileVersion:', 'ProductVersion:', 'Branch:', 'Changelist:', '<Init>', '<Game Version>', '<SetDatabaseVersion>']) {
    if (text.includes(literal)) markers.push(literal);
  }
  return markers.length ? markers : ['runtime-log-record'];
}

function classifyUnknownEvidence(text) {
  const markers = [];
  const normalized = String(text);
  const angleTags = normalized.match(/<[^>]+>/g) || [];
  const keyedBrackets = Array.from(normalized.matchAll(/\b(?<key>[A-Za-z][A-Za-z0-9_]*)\[[^\]]+\]/g))
    .map((match) => `${match.groups.key}[]`);
  markers.push(...angleTags.concat(keyedBrackets).slice(0, 4));
  return markers.length ? markers : ['unclassified-record'];
}

function profileFieldKey(field) {
  return {
    fileVersion: 'FileVersion',
    productVersion: 'ProductVersion',
    branch: 'Branch',
    changelist: 'Changelist'
  }[field] || field;
}

function toInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value) {
  if (value === true || value === false) return value;
  if (value === '1' || /^true$/i.test(String(value))) return true;
  if (value === '0' || /^false$/i.test(String(value))) return false;
  return null;
}

function cleanValue(value) {
  return String(value)
    .trim()
    .replace(/^[=:>"'\s]+/, '')
    .replace(/[<,"')\]}]+$/, '')
    .trim();
}

function toBuffer(chunk) {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (chunk instanceof Uint8Array) return Buffer.from(chunk);
  return Buffer.from(String(chunk), 'utf8');
}

function normalizeChunkInput(input) {
  if (input && typeof input === 'object' && !Buffer.isBuffer(input) && !(input instanceof Uint8Array) && input.bytes) {
    return {
      bytes: toBuffer(input.bytes),
      metadata: {
        generation: input.generation,
        sequence: input.sequence,
        offsetStart: input.offsetStart
      }
    };
  }
  return { bytes: toBuffer(input), metadata: {} };
}

function validateRequired(value, path, code, errors) {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(error(code, path, 'Required string is missing.'));
  }
}

function validateFieldAliases(value, path, errors) {
  if (!isPlainObject(value)) {
    errors.push(error('invalid_field_aliases', path, 'Profile field aliases must be an object.'));
    return;
  }
  for (const [field, aliases] of Object.entries(value)) {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(field) || !stringArray(aliases)) {
      errors.push(error('invalid_field_aliases', `${path}.${field}`, 'Each field alias entry must map a field name to strings.'));
    }
  }
}

function stringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.trim() !== '');
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function error(code, path, message) {
  return Object.freeze({ code, path, message });
}

module.exports = {
  DEFAULT_MAX_LINE_BYTES,
  DEFAULT_MAX_RECORD_BYTES,
  RuntimeLogLineFramer,
  RuntimeLogParserEngine,
  RuntimeLogProfileValidationError,
  RuntimeLogRecordAssembler,
  loadRuntimeLogProfiles,
  parseRuntimeLogText
};
