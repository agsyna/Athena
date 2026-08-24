// ../../src/core/types.ts
var TranscriptHelperMode = /* @__PURE__ */ ((TranscriptHelperMode2) => {
  TranscriptHelperMode2["TEXT"] = "text";
  TranscriptHelperMode2["WORD"] = "word";
  TranscriptHelperMode2["CHUNK"] = "chunk";
  TranscriptHelperMode2["UNKNOWN"] = "unknown";
  TranscriptHelperMode2["AUTO"] = "auto";
  return TranscriptHelperMode2;
})(TranscriptHelperMode || {});
var MessageType = /* @__PURE__ */ ((MessageType2) => {
  MessageType2["USER_TRANSCRIPTION"] = "user.transcription";
  MessageType2["AGENT_TRANSCRIPTION"] = "assistant.transcription";
  MessageType2["MSG_INTERRUPTED"] = "message.interrupt";
  MessageType2["MSG_METRICS"] = "message.metrics";
  MessageType2["MSG_ERROR"] = "message.error";
  MessageType2["MSG_STATE"] = "message.state";
  MessageType2["IMAGE_UPLOAD"] = "image.upload";
  MessageType2["MESSAGE_INFO"] = "message.info";
  MessageType2["MESSAGE_SAL_STATUS"] = "message.sal_status";
  return MessageType2;
})(MessageType || {});
var ModuleType = /* @__PURE__ */ ((ModuleType2) => {
  ModuleType2["LLM"] = "llm";
  ModuleType2["MLLM"] = "mllm";
  ModuleType2["TTS"] = "tts";
  ModuleType2["CONTEXT"] = "context";
  ModuleType2["UNKNOWN"] = "unknown";
  return ModuleType2;
})(ModuleType || {});
var ConversationalAIError = class extends Error {
  constructor(message, options) {
    super(message);
    this.name = "ConversationalAIError";
    if (options?.cause !== void 0) {
      this.cause = options.cause;
    }
  }
};
var NotInitializedError = class extends ConversationalAIError {
  constructor() {
    super(
      "AgoraVoiceAI is not initialized. Call await AgoraVoiceAI.init(config) before using getInstance()."
    );
    this.name = "NotInitializedError";
  }
};
var RTMRequiredError = class extends ConversationalAIError {
  constructor(method) {
    super(
      `[AgoraVoiceAI] ${method}() requires RTM. Pass rtmConfig: { rtmEngine } when calling AgoraVoiceAI.init().`
    );
    this.name = "RTMRequiredError";
  }
};
var NotFoundError = NotInitializedError;
var TurnStatus = /* @__PURE__ */ ((TurnStatus2) => {
  TurnStatus2[TurnStatus2["IN_PROGRESS"] = 0] = "IN_PROGRESS";
  TurnStatus2[TurnStatus2["END"] = 1] = "END";
  TurnStatus2[TurnStatus2["INTERRUPTED"] = 2] = "INTERRUPTED";
  return TurnStatus2;
})(TurnStatus || {});
var AgentState = /* @__PURE__ */ ((AgentState2) => {
  AgentState2["IDLE"] = "idle";
  AgentState2["LISTENING"] = "listening";
  AgentState2["THINKING"] = "thinking";
  AgentState2["SPEAKING"] = "speaking";
  AgentState2["SILENT"] = "silent";
  return AgentState2;
})(AgentState || {});
var ChatMessagePriority = /* @__PURE__ */ ((ChatMessagePriority2) => {
  ChatMessagePriority2["INTERRUPTED"] = "interrupted";
  ChatMessagePriority2["APPEND"] = "append";
  ChatMessagePriority2["IGNORE"] = "ignore";
  return ChatMessagePriority2;
})(ChatMessagePriority || {});
var ChatMessageType = /* @__PURE__ */ ((ChatMessageType2) => {
  ChatMessageType2["TEXT"] = "text";
  ChatMessageType2["IMAGE"] = "image";
  ChatMessageType2["UNKNOWN"] = "unknown";
  return ChatMessageType2;
})(ChatMessageType || {});
var LocalTranscriptStatus = /* @__PURE__ */ ((LocalTranscriptStatus2) => {
  LocalTranscriptStatus2["PENDING"] = "pending";
  LocalTranscriptStatus2["SENT"] = "sent";
  LocalTranscriptStatus2["FAILED"] = "failed";
  return LocalTranscriptStatus2;
})(LocalTranscriptStatus || {});
var MessageSalStatus = /* @__PURE__ */ ((MessageSalStatus2) => {
  MessageSalStatus2["VP_DISABLED"] = "VP_DISABLED";
  MessageSalStatus2["VP_UNREGISTER"] = "VP_UNREGISTER";
  MessageSalStatus2["VP_REGISTERING"] = "VP_REGISTERING";
  MessageSalStatus2["VP_REGISTER_SUCCESS"] = "VP_REGISTER_SUCCESS";
  MessageSalStatus2["VP_REGISTER_FAIL"] = "VP_REGISTER_FAIL";
  MessageSalStatus2["VP_REGISTER_DUPLICATE"] = "VP_REGISTER_DUPLICATE";
  return MessageSalStatus2;
})(MessageSalStatus || {});

// ../../src/core/events.ts
var AgoraVoiceAIEvents = /* @__PURE__ */ ((AgoraVoiceAIEvents2) => {
  AgoraVoiceAIEvents2["AGENT_STATE_CHANGED"] = "agent-state-changed";
  AgoraVoiceAIEvents2["AGENT_INTERRUPTED"] = "agent-interrupted";
  AgoraVoiceAIEvents2["AGENT_METRICS"] = "agent-metrics";
  AgoraVoiceAIEvents2["AGENT_ERROR"] = "agent-error";
  AgoraVoiceAIEvents2["TRANSCRIPT_UPDATED"] = "transcript-updated";
  AgoraVoiceAIEvents2["DEBUG_LOG"] = "debug-log";
  AgoraVoiceAIEvents2["MESSAGE_RECEIPT_UPDATED"] = "message-receipt-updated";
  AgoraVoiceAIEvents2["MESSAGE_ERROR"] = "message-error";
  AgoraVoiceAIEvents2["MESSAGE_SAL_STATUS"] = "message-sal-status";
  return AgoraVoiceAIEvents2;
})(AgoraVoiceAIEvents || {});
var EventLogLevel = /* @__PURE__ */ ((EventLogLevel2) => {
  EventLogLevel2[EventLogLevel2["NONE"] = 0] = "NONE";
  EventLogLevel2[EventLogLevel2["ERRORS"] = 1] = "ERRORS";
  EventLogLevel2[EventLogLevel2["DEBUG"] = 2] = "DEBUG";
  return EventLogLevel2;
})(EventLogLevel || {});
var EventHelper = class {
  constructor() {
    this._eventMap = /* @__PURE__ */ new Map();
    this._onceWrappers = /* @__PURE__ */ new Map();
    this._logLevel = 0 /* NONE */;
    this._maxListeners = 10;
    this._warnedEvents = /* @__PURE__ */ new Set();
  }
  /**
   * Set the maximum number of listeners per event before a warning is logged.
   * Defaults to 10 (matches Node.js convention). Set to 0 to disable.
   */
  setMaxListeners(n) {
    this._maxListeners = n;
    return this;
  }
  /**
   * Set the log verbosity for this instance.
   * Defaults to `EventLogLevel.NONE` (silent).
   */
  setLogLevel(level) {
    this._logLevel = level;
    return this;
  }
  /** Read-only access to the current log level for subclasses. */
  get logLevel() {
    return this._logLevel;
  }
  /** Returns the number of listeners registered for each event. */
  getListenerCounts() {
    const counts = {};
    for (const [key, cbs] of this._eventMap) {
      counts[String(key)] = cbs.length;
    }
    return counts;
  }
  /**
   * Registers a one-time handler that is automatically removed after the first invocation.
   * The handler can also be removed before it fires via `off(evt, cb)`.
   */
  once(evt, cb) {
    const wrapper = (...args) => {
      this.off(evt, wrapper);
      this._onceWrappers.delete(cb);
      cb(...args);
    };
    this._onceWrappers.set(cb, wrapper);
    this.on(evt, wrapper);
    return this;
  }
  on(evt, cb) {
    const cbs = this._eventMap.get(evt) ?? [];
    cbs.push(cb);
    this._eventMap.set(evt, cbs);
    if (this._maxListeners > 0 && cbs.length > this._maxListeners && !this._warnedEvents.has(evt)) {
      this._warnedEvents.add(evt);
      console.warn(
        `[ConversationalAI] Possible listener leak: ${String(evt)} has ${cbs.length} listeners (max: ${this._maxListeners}). Use setMaxListeners() to increase if intentional.`
      );
    }
    if (this._logLevel >= 2 /* DEBUG */) {
      console.debug(`Subscribed to event: ${String(evt)}`);
    }
    return this;
  }
  off(evt, cb) {
    const cbs = this._eventMap.get(evt);
    if (cbs) {
      const actual = this._onceWrappers.get(cb) ?? cb;
      this._eventMap.set(
        evt,
        cbs.filter((it) => it !== actual)
      );
      this._onceWrappers.delete(cb);
      if (this._logLevel >= 2 /* DEBUG */) {
        console.debug(`Unsubscribed from event: ${String(evt)}`);
      }
    }
    return this;
  }
  removeAllEventListeners() {
    this._eventMap.clear();
    this._onceWrappers.clear();
    if (this._logLevel >= 2 /* DEBUG */) {
      console.debug("Removed all event listeners");
    }
  }
  emit(evt, ...args) {
    const cbs = this._eventMap.get(evt) ?? [];
    for (const cb of cbs) {
      try {
        cb && cb(...args);
      } catch (e) {
        if (this._logLevel >= 1 /* ERRORS */) {
          const error = e;
          const details = error.stack || error.message;
          console.error(`Error handling event ${String(evt)}: ${details}`);
        }
      }
    }
    if (this._logLevel >= 2 /* DEBUG */) {
      console.debug({ args }, `Emitted event: ${String(evt)}`);
    }
    return this;
  }
};

// ../../src/utils/debug.ts
var MAX_ZIP_SIZE = 4 * 1024 * 1024;
var LogManager = class {
  constructor() {
    this.currentSize = 0;
    this.logs = [];
    this.textEncoder = new TextEncoder();
  }
  addLog(level, ...args) {
    try {
      const timestamp = (/* @__PURE__ */ new Date()).toISOString();
      const logMessage = args.map((arg) => typeof arg === "string" ? arg : JSON.stringify(arg)).join(" ");
      if (process.env.NODE_ENV === "development") {
        console[level](`[${timestamp}] ${logMessage}`);
      }
      const fullLogMessage = `${timestamp} ${logMessage}
`;
      const logSize = this.textEncoder.encode(fullLogMessage).length;
      const logEntry = {
        message: fullLogMessage,
        size: logSize
      };
      this.logs.push(logEntry);
      this.currentSize += logSize;
      if (this.currentSize > MAX_ZIP_SIZE) {
        let removedSize = 0;
        let removeCount = 0;
        for (const log of this.logs) {
          removedSize += log.size;
          removeCount++;
          if (this.currentSize - removedSize <= MAX_ZIP_SIZE) {
            break;
          }
        }
        this.logs = this.logs.slice(removeCount);
        this.currentSize -= removedSize;
      }
    } catch (error) {
      console.info("Error in addLog:", error);
    }
  }
  async downloadLogs() {
    let JSZip;
    try {
      JSZip = (await import('jszip')).default;
    } catch {
      throw new Error(
        "[ConversationalAI] downloadLogs requires jszip. Install it with: npm install jszip"
      );
    }
    try {
      const zip = new JSZip();
      const logContent = this.logs.map((log) => log.message).join("");
      zip.file("log.txt", logContent);
      const content = await zip.generateAsync({ type: "blob" });
      const file = new File([content], "logs.zip", { type: "application/zip" });
      this.clear();
      return file;
    } catch (error) {
      console.error("Error creating log file:", error);
      return null;
    }
  }
  clear() {
    this.logs = [];
    this.currentSize = 0;
  }
  info(...args) {
    this.addLog("info" /* info */, ...args);
  }
  log(...args) {
    this.addLog("log" /* log */, ...args);
  }
  debug(...args) {
    this.addLog("debug" /* debug */, ...args);
  }
  error(...args) {
    this.addLog("error" /* error */, ...args);
  }
  warn(...args) {
    this.addLog("warn" /* warn */, ...args);
  }
};
var logger = new LogManager();
var genTraceID = (length = 8) => {
  let result = "";
  const characters = "abcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charactersLength);
    result += characters[randomIndex];
  }
  return result;
};
var safeStringify = (arg) => {
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
};
var factoryFormatLog = (options) => (...args) => {
  return `[${options.tag}] ${args.map(safeStringify).join(" ")}`;
};

// ../../src/utils/metrics.ts
var ConsoleMetricsReporter = class {
  report(event, data) {
    console.debug(`[ConversationalAI:metrics] ${event}`, data);
  }
};
var AgoraMetricsReporter = class {
  constructor() {
    this.reporter = null;
  }
  async init() {
    try {
      const { default: AgoraReport } = await import('@agora-js/report');
      if (typeof AgoraReport !== "function") {
        console.warn(
          "[ConversationalAI] @agora-js/report default export is not a constructor. Falling back to console metrics."
        );
        return;
      }
      this.reporter = new AgoraReport();
    } catch (e) {
      const isModuleNotFound = e instanceof Error && ("code" in e && e.code === "MODULE_NOT_FOUND" || e.message.includes("Cannot find module"));
      if (isModuleNotFound) {
        console.warn(
          "[ConversationalAI] @agora-js/report not found. Falling back to console metrics. Install it with: pnpm add @agora-js/report"
        );
      } else {
        console.error("[ConversationalAI] Failed to initialize @agora-js/report:", e);
      }
    }
  }
  report(event, data) {
    if (this.reporter) {
      this.reporter.report(event, data);
    } else {
      console.debug(`[ConversationalAI:metrics] ${event}`, data);
    }
  }
};

// ../../src/rendering/sub-render-pts.ts
var SubRenderPTS = class {
  constructor(interval, callMessagePrint, handleQueue) {
    this._pts = 0;
    // current pts
    this._intervalRef = null;
    this._isRunning = false;
    this._interval = interval;
    this.callMessagePrint = callMessagePrint;
    this.handleQueue = handleQueue;
  }
  get pts() {
    return this._pts;
  }
  get isRunning() {
    return this._isRunning;
  }
  setRunning(value) {
    this._isRunning = value;
  }
  setInterval(interval) {
    this._interval = interval;
  }
  _preSetupInterval() {
    if (!this._isRunning) {
      this.callMessagePrint(
        "error" /* error */,
        "_preSetupInterval",
        "Message service is not running"
      );
      return;
    }
  }
  setupIntervalForWords(options) {
    this._preSetupInterval();
    if (options?.isForce) {
      if (this._intervalRef) {
        clearInterval(this._intervalRef);
        this._intervalRef = null;
      }
      this._intervalRef = setInterval(() => this.handleQueue(this._pts), this._interval);
      return;
    }
    if (this._intervalRef) {
      return;
    }
    this._intervalRef = setInterval(() => this.handleQueue(this._pts), this._interval);
  }
  teardownInterval() {
    if (this._intervalRef) {
      clearInterval(this._intervalRef);
      this._intervalRef = null;
    }
  }
  get intervalRef() {
    return this._intervalRef;
  }
  setIntervalRef(ref) {
    this._intervalRef = ref;
  }
  setPts(pts) {
    if (pts > 0 && pts > this._pts) {
      this._pts = pts;
    }
  }
  reset() {
    this.teardownInterval();
    this._pts = 0;
    this._isRunning = false;
  }
};

// ../../src/rendering/sub-render-queue.ts
var SELF_USER_ID = 0;
var SubRenderQueue = class {
  constructor(callMessagePrint, mutateChatHistory) {
    this.queue = [];
    this.lastPoppedQueueItem = null;
    this.chatHistory = [];
    // Chunk mode state — owned here because it is pending queue content
    this.transcriptChunk = null;
    this.callMessagePrint = callMessagePrint;
    this.mutateChatHistory = mutateChatHistory;
  }
  // -----------------------------------------------------------------------
  // Queue processing (called from SubRenderPTS interval)
  // -----------------------------------------------------------------------
  processQueue(curPTS) {
    const queueLength = this.queue.length;
    if (queueLength === 0) {
      return;
    }
    if (queueLength === 1) {
      const queueItem = this.queue[0];
      this._handleTurnObj(queueItem, curPTS);
      this.mutateChatHistory();
      return;
    }
    if (queueLength > 2) {
      this.callMessagePrint(
        "error" /* error */,
        "Queue length is greater than 2, but it should not happen"
      );
    }
    if (queueLength > 1) {
      this.queue = this.queue.sort((a, b) => a.turn_id - b.turn_id);
      const nextItem = this.queue[this.queue.length - 1];
      const lastItem = this.queue[this.queue.length - 2];
      if (!nextItem.words.length) {
        this._handleTurnObj(lastItem, curPTS);
        this.mutateChatHistory();
        return;
      }
      const firstWordOfNextItem = nextItem.words[0];
      if (firstWordOfNextItem.start_ms > curPTS) {
        this._handleTurnObj(lastItem, curPTS);
        this.mutateChatHistory();
        return;
      }
      const lastItemCorrespondingChatHistoryItem = this.chatHistory.find(
        (item) => item.turn_id === lastItem.turn_id && item.stream_id === lastItem.stream_id
      );
      if (!lastItemCorrespondingChatHistoryItem) {
        this.callMessagePrint(
          "warn" /* warn */,
          "No corresponding chatHistory item found",
          lastItem
        );
        return;
      }
      lastItemCorrespondingChatHistoryItem.status = 2 /* INTERRUPTED */;
      this.lastPoppedQueueItem = this.queue.shift();
      this._handleTurnObj(nextItem, curPTS);
      this.mutateChatHistory();
      return;
    }
  }
  _handleTurnObj(queueItem, curPTS) {
    let correspondingChatHistoryItem = this.chatHistory.find(
      (item) => item.turn_id === queueItem.turn_id && item.stream_id === queueItem.stream_id
    );
    this.callMessagePrint(
      "debug" /* debug */,
      "handleTurnObj",
      queueItem,
      "correspondingChatHistoryItem",
      correspondingChatHistoryItem
    );
    if (!correspondingChatHistoryItem) {
      this.callMessagePrint(
        "debug" /* debug */,
        "handleTurnObj",
        "No corresponding chatHistory item found",
        "push to chatHistory"
      );
      correspondingChatHistoryItem = {
        turn_id: queueItem.turn_id,
        uid: queueItem.uid,
        stream_id: queueItem.stream_id,
        _time: (/* @__PURE__ */ new Date()).getTime(),
        text: "",
        status: queueItem.status,
        metadata: queueItem
      };
      this.appendChatHistory(correspondingChatHistoryItem);
    }
    correspondingChatHistoryItem._time = (/* @__PURE__ */ new Date()).getTime();
    correspondingChatHistoryItem.metadata = queueItem;
    if (queueItem.status === 2 /* INTERRUPTED */) {
      correspondingChatHistoryItem.status = 2 /* INTERRUPTED */;
    }
    const validWords = [];
    const restWords = [];
    for (const word of queueItem.words) {
      if (word.start_ms <= curPTS) {
        validWords.push(word);
      } else {
        restWords.push(word);
      }
    }
    const isRestWordsEmpty = restWords.length === 0;
    const isLastWordFinal = validWords.length > 0 && validWords[validWords.length - 1].word_status !== 0 /* IN_PROGRESS */;
    if (isRestWordsEmpty && isLastWordFinal) {
      correspondingChatHistoryItem.text = queueItem.text;
      correspondingChatHistoryItem.status = queueItem.status;
      this.lastPoppedQueueItem = this.queue.shift();
      return;
    }
    const validWordsText = validWords.filter((word) => word.start_ms <= curPTS).map((word) => word.word).join("");
    correspondingChatHistoryItem.text = validWordsText;
    const isLastWordInterrupted = validWords.length > 0 && validWords[validWords.length - 1].word_status === 2 /* INTERRUPTED */;
    if (isLastWordInterrupted) {
      this.lastPoppedQueueItem = this.queue.shift();
      return;
    }
    return;
  }
  /**
   * Appends an item to chatHistory.
   * @remarks Items with `turn_id === 0` (greeting messages) are prepended.
   */
  appendChatHistory(item) {
    if (item.turn_id === 0) {
      this.chatHistory = [item, ...this.chatHistory];
    } else {
      this.chatHistory.push(item);
    }
  }
  /**
   * Marks a queued turn as interrupted by splitting its words at `start_ms`.
   * Words at or before the split point keep their text; the last rendered word
   * and all subsequent words are marked INTERRUPTED so the PTS loop stops emitting them.
   */
  interruptQueue(options) {
    const turn_id = options.turn_id;
    const start_ms = options.start_ms;
    const correspondingQueueItem = this.queue.find((item) => item.turn_id === turn_id);
    this.callMessagePrint(
      "debug" /* debug */,
      "interruptQueue",
      `turn_id: ${turn_id}, start_ms: ${start_ms}, correspondingQueueItem: ${correspondingQueueItem}`
    );
    if (!correspondingQueueItem) {
      return;
    }
    correspondingQueueItem.status = 2 /* INTERRUPTED */;
    const leftWords = correspondingQueueItem.words.filter((word) => word.start_ms <= start_ms);
    const rightWords = correspondingQueueItem.words.filter((word) => word.start_ms > start_ms);
    if (leftWords.length === 0) {
      correspondingQueueItem.words.forEach((word) => {
        word.word_status = 2 /* INTERRUPTED */;
      });
    } else {
      leftWords[leftWords.length - 1].word_status = 2 /* INTERRUPTED */;
      if (leftWords?.[leftWords.length - 2]) {
        leftWords[leftWords.length - 2].word_status = 2 /* INTERRUPTED */;
      }
      rightWords.forEach((word) => {
        word.word_status = 2 /* INTERRUPTED */;
      });
      correspondingQueueItem.words = [...leftWords, ...rightWords];
    }
  }
  pushToQueue(data) {
    const targetQueueItem = this.queue.find((item) => item.turn_id === data.turn_id);
    const latestTurnId = this.queue.reduce((max, item) => {
      return Math.max(max, item.turn_id);
    }, 0);
    if (!targetQueueItem) {
      if (data.turn_id < latestTurnId) {
        this.callMessagePrint(
          "debug" /* debug */,
          `[Word Mode]`,
          `[${data.uid}]`,
          "Drop message with turn_id less than latestTurnId",
          `turn_id: ${data.turn_id}, latest turn_id: ${latestTurnId}`,
          data
        );
        return;
      }
      const newQueueItem = {
        turn_id: data.turn_id,
        text: data.text,
        words: this.sortWordsWithStatus(data.words, data.status),
        status: data.status,
        stream_id: data.stream_id,
        uid: data.uid
      };
      this.callMessagePrint(
        "debug" /* debug */,
        `[Word Mode]`,
        `[${data.uid}]`,
        "push to queue",
        newQueueItem
      );
      this.queue.push(newQueueItem);
      return;
    }
    this.callMessagePrint(
      "debug" /* debug */,
      `[Word Mode]`,
      `[${data.uid}]`,
      "update queue item",
      targetQueueItem,
      data
    );
    targetQueueItem.text = data.text;
    targetQueueItem.words = this.sortWordsWithStatus(
      [...targetQueueItem.words, ...data.words],
      data.status
    );
    if (targetQueueItem.status !== 0 /* IN_PROGRESS */ && data.status === 0 /* IN_PROGRESS */) {
      return;
    }
    targetQueueItem.status = data.status;
  }
  /**
   * Sorts words by `start_ms`, deduplicates by `start_ms`, and stamps the
   * final word with `turn_status` when the turn is complete or interrupted.
   */
  sortWordsWithStatus(words, turn_status) {
    if (words.length === 0) {
      return words;
    }
    const sortedWords = words.map((word) => ({
      ...word,
      word_status: 0 /* IN_PROGRESS */
    })).sort((a, b) => a.start_ms - b.start_ms).reduce((acc, curr) => {
      if (!acc.find((word) => word.start_ms === curr.start_ms)) {
        acc.push(curr);
      }
      return acc;
    }, []);
    const isMessageFinal = turn_status !== 0 /* IN_PROGRESS */;
    if (isMessageFinal && sortedWords.length > 0) {
      sortedWords[sortedWords.length - 1].word_status = turn_status;
    }
    return sortedWords;
  }
  reset() {
    this.queue = [];
    this.lastPoppedQueueItem = null;
    this.chatHistory = [];
    this.transcriptChunk = null;
  }
};
SubRenderQueue.self_uid = SELF_USER_ID;

// ../../src/rendering/sub-render.ts
var TAG = "CovSubRenderController";
var SELF_USER_ID2 = 0;
var DEFAULT_INTERVAL = 200;
var DEFAULT_CHUNK_INTERVAL = 100;
var formatLog = factoryFormatLog({ tag: TAG });
var _CovSubRenderController = class _CovSubRenderController {
  constructor(options = {}) {
    this._mode = "unknown" /* UNKNOWN */;
    this._agentMessageState = null;
    this._transcriptChunk = null;
    this.onChatHistoryUpdated = null;
    this.onAgentInterrupted = null;
    this.onDebugLog = null;
    this.onAgentMetrics = null;
    this.onAgentError = null;
    this.onMessageReceipt = null;
    this.onMessageError = null;
    this.onMessageSalStatus = null;
    this._enableLog = options.enableLog ?? false;
    this.callMessagePrint = (type = "debug" /* debug */, ...args) => {
      if (!this._enableLog) return;
      logger[type](formatLog(...args));
      this.onDebugLog?.(`[${type}] ${formatLog(...args)}`);
    };
    this.callMessagePrint("debug" /* debug */, `${_CovSubRenderController.NAME} initialized`);
    const interval = options.interval ?? DEFAULT_INTERVAL;
    this._queue = new SubRenderQueue(this.callMessagePrint, this._mutateChatHistory.bind(this));
    this._pts = new SubRenderPTS(
      interval,
      this.callMessagePrint,
      this._queue.processQueue.bind(this._queue)
    );
    this.onChatHistoryUpdated = options.onChatHistoryUpdated ?? null;
    this.onAgentStateChanged = options.onAgentStateChanged ?? null;
    this.onAgentInterrupted = options.onAgentInterrupted ?? null;
    this.onDebugLog = options.onDebugLog ?? null;
    this.onAgentMetrics = options.onAgentMetrics ?? null;
    this.onAgentError = options.onAgentError ?? null;
    this.onMessageReceipt = options.onMessageReceipt ?? null;
    this.onMessageError = options.onMessageError ?? null;
    this.onMessageSalStatus = options.onMessageSalStatus ?? null;
  }
  get chatHistory() {
    return this._queue.chatHistory;
  }
  _mutateChatHistory() {
    this.callMessagePrint(
      "debug" /* debug */,
      ">>> onChatHistoryUpdated",
      `pts: ${this._pts.pts}, chatHistory length: ${this._queue.chatHistory.length}`,
      this._queue.chatHistory.map((item) => `${item.uid}:${item.text}[status: ${item.status}]`).join("\n")
    );
    this.onChatHistoryUpdated?.(this._queue.chatHistory);
  }
  handleTextMessage(uid, message) {
    const turn_id = message.turn_id;
    const text = message.text || "";
    const stream_id = message.stream_id;
    const turn_status = 1 /* END */;
    const isUserTranscription = message.object === "user.transcription" /* USER_TRANSCRIPTION */;
    const resolvedUid = isUserTranscription ? `${_CovSubRenderController.self_uid}` : `${uid}`;
    const targetChatHistoryItem = this._queue.chatHistory.find(
      (item) => item.turn_id === turn_id && item.stream_id === stream_id && item.uid === resolvedUid
    );
    if (!targetChatHistoryItem) {
      this.callMessagePrint("debug" /* debug */, `[Text Mode]`, `[${uid}]`, "new item", message);
      this._queue.appendChatHistory({
        turn_id,
        uid: resolvedUid,
        stream_id,
        _time: (/* @__PURE__ */ new Date()).getTime(),
        text,
        status: turn_status,
        metadata: message
      });
    } else {
      targetChatHistoryItem.text = text;
      targetChatHistoryItem.status = turn_status;
      targetChatHistoryItem.metadata = message;
      targetChatHistoryItem._time = (/* @__PURE__ */ new Date()).getTime();
      this.callMessagePrint("debug" /* debug */, `[Text Mode]`, `[${uid}]`, targetChatHistoryItem);
    }
    this._mutateChatHistory();
  }
  _handleTranscriptChunk() {
    if (!this._transcriptChunk) {
      this.callMessagePrint(
        "warn" /* warn */,
        `[${"chunk" /* CHUNK */} Mode]`,
        "_handleTranscriptChunk",
        "missing _transcriptChunk"
      );
      return;
    }
    const currentIdx = this._transcriptChunk.index;
    const currentTranscript = this._transcriptChunk.data;
    const currentMaxLength = currentTranscript.text.length;
    const uid = this._transcriptChunk.uid;
    const nextIdx = currentIdx + 1 >= currentMaxLength ? currentMaxLength : currentIdx + 1;
    this._transcriptChunk.index = nextIdx;
    const validTranscriptString = currentTranscript.text.substring(0, nextIdx);
    const isValidTranscriptStringEnded = validTranscriptString.length > 0 && currentTranscript.turn_status !== 0 /* IN_PROGRESS */ && validTranscriptString.length === currentTranscript.text.length;
    const resolvedUid = currentTranscript.object === "user.transcription" /* USER_TRANSCRIPTION */ ? `${_CovSubRenderController.self_uid}` : `${uid}`;
    const targetChatHistoryItem = this._queue.chatHistory.find(
      (item) => item.turn_id === currentTranscript.turn_id && item.stream_id === currentTranscript.stream_id && item.uid === resolvedUid
    );
    if (!targetChatHistoryItem) {
      this.callMessagePrint(
        "debug" /* debug */,
        `[${"chunk" /* CHUNK */} Mode]`,
        `[${uid}]`,
        "new transcriptChunk",
        this._transcriptChunk
      );
      this._queue.appendChatHistory({
        turn_id: currentTranscript.turn_id,
        uid: resolvedUid,
        stream_id: currentTranscript.stream_id,
        _time: Date.now(),
        text: validTranscriptString,
        status: currentTranscript.turn_status,
        metadata: currentTranscript
      });
    } else {
      targetChatHistoryItem.text = validTranscriptString;
      targetChatHistoryItem.status = isValidTranscriptStringEnded ? currentTranscript.turn_status : targetChatHistoryItem.status;
      targetChatHistoryItem.metadata = currentTranscript;
      targetChatHistoryItem._time = Date.now();
      this.callMessagePrint(
        "debug" /* debug */,
        `[${"chunk" /* CHUNK */} Mode]`,
        `[${uid}]`,
        "update transcriptChunk",
        targetChatHistoryItem
      );
    }
    this._mutateChatHistory();
  }
  handleChunkTextMessage(uid, message) {
    this.callMessagePrint(
      "debug" /* debug */,
      `[${"chunk" /* CHUNK */} Mode]`,
      `[${uid}]`,
      "new item",
      message
    );
    if (this._transcriptChunk && this._transcriptChunk.data.turn_id < message.turn_id) {
      this._pts.teardownInterval();
      const lastChatHistory = this._queue.chatHistory.find(
        (item) => item.turn_id === this._transcriptChunk?.data.turn_id && item.uid === uid
      );
      if (lastChatHistory) {
        lastChatHistory.status = 1 /* END */;
      }
      this._transcriptChunk = null;
    }
    this._transcriptChunk = {
      index: this._transcriptChunk?.index ?? 0,
      data: message,
      uid
    };
    if (!this._pts.intervalRef) {
      this._pts.setIntervalRef(
        setInterval(this._handleTranscriptChunk.bind(this), DEFAULT_CHUNK_INTERVAL)
      );
    }
  }
  handleMessageInterrupt(uid, message) {
    this.callMessagePrint(
      "debug" /* debug */,
      "<<< [onInterrupted]",
      `pts: ${this._pts.pts}, uid: ${uid}`,
      message
    );
    const turn_id = message.turn_id;
    const start_ms = Math.min(message.start_ms, this._pts.pts) || message.start_ms;
    this._queue.interruptQueue({
      turn_id,
      start_ms
    });
    if (this._transcriptChunk) {
      this._pts.teardownInterval();
      const lastChatHistory = this._queue.chatHistory.find(
        (item) => item.turn_id === this._transcriptChunk?.data.turn_id && item.uid === uid
      );
      if (lastChatHistory) {
        lastChatHistory.status = 2 /* INTERRUPTED */;
      }
      this._transcriptChunk = null;
    }
    this._mutateChatHistory();
    this.onAgentInterrupted?.(`${uid}`, {
      turnID: turn_id,
      timestamp: start_ms
    });
  }
  handleMessageMetrics(uid, message) {
    const latency_ms = message.latency_ms;
    const messageModule = message.module;
    const metric_name = message.metric_name;
    if (!Object.values(ModuleType).includes(messageModule)) {
      this.callMessagePrint("warn" /* warn */, "Unknown metric module:", message);
      return;
    }
    this.onAgentMetrics?.(`${uid}`, {
      type: messageModule,
      name: metric_name,
      value: latency_ms,
      timestamp: message.send_ts
    });
  }
  handleMessageSalStatus(uid, message) {
    this.callMessagePrint("debug" /* debug */, "handleMessageSalStatus", message);
    this.onMessageSalStatus?.(`${uid}`, message);
  }
  handleMessageError(uid, message) {
    const errorCode = message.code || -1;
    const errorMessage = message.message;
    const messageModule = message.module;
    if (!Object.values(ModuleType).includes(messageModule)) {
      this.callMessagePrint("warn" /* warn */, "Unknown error module:", message);
      return;
    }
    if (messageModule === "context" /* CONTEXT */) {
      try {
        const messageData = JSON.parse(errorMessage);
        const errorPayload = {
          type: messageData?.module === "picture" ? "image" /* IMAGE */ : "unknown" /* UNKNOWN */,
          code: errorCode,
          message: errorMessage,
          timestamp: message?.send_ts || Date.now()
        };
        this.onMessageError?.(`${uid}`, errorPayload);
      } catch (error) {
        this.callMessagePrint(
          "error" /* error */,
          "Failed to parse context error message",
          error,
          message
        );
      }
      return;
    }
    this.onAgentError?.(`${uid}`, {
      type: messageModule,
      code: errorCode,
      message: errorMessage,
      timestamp: message?.send_ts || Date.now()
    });
  }
  // current only used for image messages
  handleMessageInfo(uid, message) {
    try {
      const messageStr = message?.message || "";
      const messageObj = JSON.parse(messageStr);
      const moduleType = message?.module;
      const turnId = message?.turn_id;
      if (!messageStr || !messageObj || !moduleType || !turnId) {
        this.callMessagePrint(
          "error" /* error */,
          "handleMessageInfo",
          "Invalid message object",
          message
        );
        return;
      }
      const messageType = message?.resource_type === "picture" ? "image" /* IMAGE */ : "unknown" /* UNKNOWN */;
      this.onMessageReceipt?.(uid, {
        moduleType,
        messageType,
        message: messageStr,
        turnId
      });
    } catch (error) {
      this.callMessagePrint(
        "debug" /* debug */,
        "handleMessageInfo",
        "Failed to parse message string from image info message",
        error,
        message
      );
    }
  }
  handleAgentStatus(metadata) {
    const message = metadata.stateChanged;
    const parsedTurnId = Number(message.turn_id);
    const currentTurnId = Number.isFinite(parsedTurnId) ? parsedTurnId : -1;
    const lastTurnId = Number(this._agentMessageState?.turn_id ?? -1);
    const lastTurnIdSafe = Number.isFinite(lastTurnId) ? lastTurnId : -1;
    if (lastTurnIdSafe > currentTurnId) {
      this.callMessagePrint(
        "debug" /* debug */,
        "handleAgentStatus",
        "ignore older message(turn_id)"
      );
      return;
    }
    const currentMsgTs = metadata.timestamp;
    if (Number(this._agentMessageState?.timestamp ?? 0) >= currentMsgTs) {
      this.callMessagePrint(
        "debug" /* debug */,
        "handleAgentStatus",
        "ignore older message(timestamp)"
      );
      return;
    }
    this.callMessagePrint(
      "debug" /* debug */,
      ">>> handleAgentStatus",
      `pts: ${this._pts.pts}, uid: ${metadata.publisher}`,
      `prev-state: ${this._agentMessageState?.state}, prev-turn_id: ${this._agentMessageState?.turn_id}, prev-timestamp: ${this._agentMessageState?.timestamp}`,
      `current-state: ${metadata.stateChanged.state}, turn_id: ${metadata.stateChanged.turn_id}, timestamp: ${metadata.timestamp}`
    );
    this._agentMessageState = {
      state: message.state,
      turn_id: message.turn_id,
      timestamp: currentMsgTs
    };
    this.onAgentStateChanged?.(metadata.publisher, {
      state: message.state,
      turnID: Number(message.turn_id),
      timestamp: currentMsgTs,
      reason: ""
    });
  }
  handleWordAgentMessage(uid, message) {
    if (typeof message.turn_status === "undefined") {
      this.callMessagePrint(
        "debug" /* debug */,
        `[Word Mode]`,
        `[${uid}]`,
        "Drop message with undefined turn_status",
        message.turn_id
      );
      return;
    }
    const turn_id = message.turn_id;
    const text = message.text || "";
    const words = message.words || [];
    const stream_id = message.stream_id;
    const lastPoppedQueueItemTurnId = this._queue.lastPoppedQueueItem?.turn_id;
    if (lastPoppedQueueItemTurnId && turn_id !== 0 && turn_id <= lastPoppedQueueItemTurnId) {
      this.callMessagePrint(
        "debug" /* debug */,
        `[Word Mode]`,
        `[${uid}]`,
        "Drop message with turn_id less than last popped queue item",
        `turn_id: ${turn_id}, last popped queue item turn_id: ${lastPoppedQueueItemTurnId}`
      );
      return;
    }
    this._queue.pushToQueue({
      uid: message.object === "user.transcription" /* USER_TRANSCRIPTION */ ? `${_CovSubRenderController.self_uid}` : `${uid}`,
      turn_id,
      words,
      text,
      status: message.turn_status,
      stream_id
    });
  }
  /**
   * Sets the transcript rendering mode. Can only be called once — subsequent
   * calls after mode is locked (not UNKNOWN or AUTO) are ignored with a warning.
   */
  setMode(mode) {
    if (this._mode !== "unknown" /* UNKNOWN */ && this._mode !== "auto" /* AUTO */) {
      this.callMessagePrint(
        "warn" /* warn */,
        `setMode ignored: mode already locked to ${this._mode}, cannot change to ${mode}`
      );
      return;
    }
    if (mode === "unknown" /* UNKNOWN */) {
      this.callMessagePrint("warn" /* warn */, "Unknown mode should not be set");
      return;
    }
    if (mode === "chunk" /* CHUNK */) {
      this._pts.setInterval(DEFAULT_CHUNK_INTERVAL);
    } else if (mode !== "auto" /* AUTO */) {
      this._pts.setInterval(DEFAULT_INTERVAL);
    }
    this.callMessagePrint("debug" /* debug */, `setMode`, mode);
    this._mode = mode;
  }
  handleMessage(message, options) {
    const messageObject = message?.object;
    if (!Object.values(MessageType).includes(messageObject)) {
      this.callMessagePrint("info" /* info */, `<<< [unknown message]`, options, message);
      return;
    }
    const isAgentMessage = message.object === "assistant.transcription" /* AGENT_TRANSCRIPTION */;
    const isUserMessage = message.object === "user.transcription" /* USER_TRANSCRIPTION */;
    const isMessageInterrupt = message.object === "message.interrupt" /* MSG_INTERRUPTED */;
    const isMessageMetrics = message.object === "message.metrics" /* MSG_METRICS */;
    const isMessageError = message.object === "message.error" /* MSG_ERROR */;
    const isMessageInfo = message.object === "message.info" /* MESSAGE_INFO */;
    const isMessageSalStatus = message.object === "message.sal_status" /* MESSAGE_SAL_STATUS */;
    if (isAgentMessage && (this._mode === "unknown" /* UNKNOWN */ || this._mode === "auto" /* AUTO */)) {
      if (!message.words || Array.isArray(message.words) && message.words.length === 0) {
        this.setMode("text" /* TEXT */);
      } else {
        this._pts.setupIntervalForWords({ isForce: true });
        this.setMode("word" /* WORD */);
      }
    }
    if (isAgentMessage && this._mode === "word" /* WORD */) {
      this._pts.setupIntervalForWords({ isForce: false });
      this.handleWordAgentMessage(options.publisher, message);
      return;
    }
    if (isAgentMessage && this._mode === "text" /* TEXT */) {
      this.handleTextMessage(options.publisher, message);
      return;
    }
    if (isAgentMessage && this._mode === "chunk" /* CHUNK */) {
      this.handleChunkTextMessage(options.publisher, message);
      return;
    }
    if (isUserMessage) {
      this.handleTextMessage(options.publisher, message);
      return;
    }
    if (isMessageInterrupt) {
      this.handleMessageInterrupt(options.publisher, message);
      return;
    }
    if (isMessageInfo) {
      this.handleMessageInfo(options.publisher, message);
      return;
    }
    if (isMessageMetrics) {
      this.handleMessageMetrics(options.publisher, message);
      return;
    }
    if (isMessageError) {
      this.handleMessageError(options.publisher, message);
      return;
    }
    if (isMessageSalStatus) {
      this.handleMessageSalStatus(options.publisher, message);
      return;
    }
  }
  run() {
    this._pts.setRunning(true);
  }
  setPts(pts) {
    this._pts.setPts(pts);
  }
  cleanup() {
    this.callMessagePrint("debug" /* debug */, "cleanup");
    this._pts.reset();
    this._queue.reset();
    this._mode = "unknown" /* UNKNOWN */;
    this._agentMessageState = null;
    this._transcriptChunk = null;
  }
};
_CovSubRenderController.NAME = TAG;
_CovSubRenderController.self_uid = SELF_USER_ID2;
var CovSubRenderController = _CovSubRenderController;

// ../../src/messaging/chunked.ts
var ChunkedMessageAssembler = class {
  /**
   * @param ttlMs - Time-to-live in milliseconds for incomplete messages.
   *   Cache entries older than this are evicted on the next `assemble()` call.
   *   Defaults to 30 000 ms (30 seconds).
   * @param maxCacheSize - Maximum number of in-flight message assemblies.
   *   When exceeded, the oldest entry is evicted. Defaults to 1000.
   * @param enableLog - Whether to log discarded chunks for debugging.
   */
  constructor(ttlMs = 3e4, maxCacheSize = 1e3, enableLog = false) {
    this.cache = /* @__PURE__ */ new Map();
    this.timestamps = /* @__PURE__ */ new Map();
    this.ttlMs = ttlMs;
    this.maxCacheSize = maxCacheSize;
    this.enableLog = enableLog;
  }
  /**
   * Process one pipe-delimited chunk string.
   *
   * @param raw - The raw stream text in "message_id|part_idx|part_sum|data" format
   * @returns The assembled and parsed message object when complete, or null if incomplete
   */
  assemble(raw) {
    this.evictStale();
    const parts = raw.split("|");
    if (parts.length !== 4) return null;
    const [msgId, partIdxStr, partSumStr, partData] = parts;
    const rawPartIdx = parseInt(partIdxStr, 10);
    const part_sum = partSumStr === "???" ? -1 : parseInt(partSumStr, 10);
    if (isNaN(rawPartIdx) || part_sum !== -1 && isNaN(part_sum)) {
      if (this.enableLog) {
        console.warn("[ChunkedMessageAssembler] Non-numeric part index/sum", { msgId });
      }
      return null;
    }
    if (part_sum !== -1 && part_sum <= 0) {
      if (this.enableLog) {
        console.warn("[ChunkedMessageAssembler] Invalid part_sum", { msgId, part_sum });
      }
      return null;
    }
    if (rawPartIdx < 1) {
      if (this.enableLog) {
        console.warn(
          "[ChunkedMessageAssembler] Invalid part_idx: must be >= 1 (1-based wire format)",
          { msgId, rawPartIdx }
        );
      }
      return null;
    }
    const part_idx = rawPartIdx - 1;
    if (part_sum !== -1 && part_idx >= part_sum) {
      if (this.enableLog) {
        console.warn("[ChunkedMessageAssembler] part_idx >= part_sum", {
          msgId,
          part_idx,
          part_sum
        });
      }
      return null;
    }
    if (!this.cache.has(msgId) && this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.findOldestKey();
      if (oldestKey) {
        this.cache.delete(oldestKey);
        this.timestamps.delete(oldestKey);
      }
    }
    if (!this.cache.has(msgId)) {
      this.cache.set(msgId, []);
      this.timestamps.set(msgId, Date.now());
    }
    const cached = this.cache.get(msgId);
    if (cached.some((c) => c.part_idx === part_idx)) {
      return null;
    }
    cached.push({ part_idx, part_sum, content: partData });
    cached.sort((a, b) => a.part_idx - b.part_idx);
    if (part_sum !== -1 && cached.length === part_sum) {
      const base64 = cached.map((c) => c.content).join("");
      this.cache.delete(msgId);
      this.timestamps.delete(msgId);
      try {
        const decoded = atob(base64);
        return JSON.parse(decoded);
      } catch {
        if (this.enableLog) {
          console.warn("[ChunkedMessageAssembler] Failed to decode chunk payload", { msgId });
        }
        return null;
      }
    }
    return null;
  }
  /**
   * Clear all in-progress message assemblies.
   * Call on session cleanup to prevent stale state across reconnections.
   */
  clear() {
    this.cache.clear();
    this.timestamps.clear();
  }
  /** Remove cache entries that have exceeded the TTL. */
  evictStale() {
    const now = Date.now();
    for (const [msgId, ts] of this.timestamps) {
      if (now - ts > this.ttlMs) {
        this.cache.delete(msgId);
        this.timestamps.delete(msgId);
      }
    }
  }
  /** Find the cache entry with the oldest timestamp. */
  findOldestKey() {
    let oldest;
    let oldestTs = Infinity;
    for (const [key, ts] of this.timestamps) {
      if (ts < oldestTs) {
        oldestTs = ts;
        oldest = key;
      }
    }
    return oldest;
  }
};

// ../../src/core/conversational-ai.ts
var TAG2 = "AgoraVoiceAI";
var VERSION = "1.2.0";
var formatLog2 = factoryFormatLog({ tag: TAG2 });
var _AgoraVoiceAI = class _AgoraVoiceAI extends EventHelper {
  // ── Construction ───────────────────────────────────────────────────────────
  constructor() {
    super();
    this.rtcEngine = null;
    this.rtmEngine = null;
    this.renderMode = "unknown" /* UNKNOWN */;
    this.channel = null;
    this.enableLog = false;
    this.metricsReporter = new ConsoleMetricsReporter();
    this.chunkedAssembler = new ChunkedMessageAssembler();
    this._eventTimeoutId = null;
    this._trackTranscriptHandler = null;
    this._trackStateHandler = null;
    // Pre-bound event handlers — stored so unbind uses the same reference as bind.
    this._boundHandleRtcAudioPTS = this._handleRtcAudioPTS.bind(this);
    this._boundHandleRtcStreamMessage = this._handleRtcStreamMessage.bind(this);
    this._boundHandleRtmMessage = this._handleRtmMessage.bind(this);
    this._boundHandleRtmPresence = this._handleRtmPresence.bind(this);
    this._boundHandleRtmStatus = this._handleRtmStatus.bind(this);
    this.callMessagePrint = (type = "debug" /* debug */, ...args) => {
      if (!this.enableLog) {
        return;
      }
      logger[type](formatLog2(...args));
      this.onDebugLog?.(`[${type}] ${formatLog2(...args)}`);
    };
    this.callMessagePrint(
      "debug" /* debug */,
      `${_AgoraVoiceAI.NAME} initialized, version: ${_AgoraVoiceAI.VERSION}`
    );
    const safe = (fn, name) => ((...args) => {
      try {
        fn(...args);
      } catch (e) {
        this.callMessagePrint("error" /* error */, `Error in ${name} callback`, e);
      }
    });
    this.covSubRenderController = new CovSubRenderController({
      enableLog: this.enableLog,
      onChatHistoryUpdated: safe(this.onChatHistoryUpdated.bind(this), "onChatHistoryUpdated"),
      onAgentStateChanged: safe(this.onAgentStateChanged.bind(this), "onAgentStateChanged"),
      onAgentInterrupted: safe(this.onAgentInterrupted.bind(this), "onAgentInterrupted"),
      onDebugLog: safe(this.onDebugLog.bind(this), "onDebugLog"),
      onAgentMetrics: safe(this.onAgentMetrics.bind(this), "onAgentMetrics"),
      onAgentError: safe(this.onAgentError.bind(this), "onAgentError"),
      onMessageReceipt: safe(this.onMessageReceiptUpdated.bind(this), "onMessageReceipt"),
      onMessageError: safe(this.onMessageError.bind(this), "onMessageError"),
      onMessageSalStatus: safe(this.onMessageSalStatus.bind(this), "onMessageSalStatus")
    });
  }
  // ── Public Static API ─────────────────────────────────────────────────────
  /**
   * Gets the singleton instance of AgoraVoiceAI.
   *
   * @returns The singleton instance of AgoraVoiceAI
   * @throws {@link NotInitializedError} When AgoraVoiceAI has not been initialized via {@link init}
   * @since 0.1.0
   */
  static getInstance() {
    if (!_AgoraVoiceAI._instance) {
      throw new NotInitializedError();
    }
    return _AgoraVoiceAI._instance;
  }
  /**
   * Returns a snapshot of SDK state for debugging, or null if not initialized.
   * Does not throw — safe to call at any point.
   */
  static getState() {
    return _AgoraVoiceAI._instance?.getState() ?? null;
  }
  // ── Public Instance State API ─────────────────────────────────────────────
  /**
   * Returns a snapshot of the current SDK state for debugging.
   * The returned object is a plain copy — no references to internal state.
   */
  getState() {
    return {
      initialized: !!this.rtcEngine,
      channel: this.channel,
      hasRtm: !!this.rtmEngine,
      renderMode: this.renderMode,
      listenerCounts: this.getListenerCounts()
    };
  }
  getCfg() {
    if (!this.rtcEngine) {
      throw new NotInitializedError();
    }
    return {
      rtcEngine: this.rtcEngine,
      renderMode: this.renderMode,
      channel: this.channel,
      enableLog: this.enableLog
    };
  }
  /**
   * Requires RTM to be configured. Throws a descriptive error when called
   * without rtmConfig. Used internally by sendText, sendImage, and interrupt.
   */
  requireRTM(method = "requireRTM") {
    if (!this.rtmEngine) {
      throw new RTMRequiredError(method);
    }
    return this.rtmEngine;
  }
  // ── Initialization Lifecycle ──────────────────────────────────────────────
  /**
   * Initializes the AgoraVoiceAI singleton instance.
   *
   * This method sets up the RTC and RTM engines, render mode, and logging options.
   * It must be called before any other methods of AgoraVoiceAI can be used.
   *
   * If an instance already exists, its event bindings and state are cleaned up
   * before reinitializing with the new configuration.
   *
   * @param cfg - Configuration object for initializing the API
   * @returns The initialized instance of AgoraVoiceAI
   * @since 0.1.0
   */
  static async init(cfg) {
    if (_AgoraVoiceAI._initPromise) {
      try {
        await _AgoraVoiceAI._initPromise;
      } catch {
      }
    }
    _AgoraVoiceAI._initPromise = _AgoraVoiceAI._doInit(cfg);
    try {
      return await _AgoraVoiceAI._initPromise;
    } finally {
      _AgoraVoiceAI._initPromise = null;
    }
  }
  static _validateEngines(cfg) {
    const isDev = typeof process === "undefined" || process?.env?.NODE_ENV !== "production";
    if (!isDev) {
      return;
    }
    const assertFunction = (owner, key, value) => {
      if (typeof value !== "function") {
        throw new ConversationalAIError(
          `[AgoraVoiceAI] Invalid ${owner}: expected \`${key}\` to be a function.`
        );
      }
    };
    const rtcEngine = cfg.rtcEngine;
    assertFunction("rtcEngine", "rtcEngine.on(eventName, listener)", rtcEngine?.on);
    assertFunction("rtcEngine", "rtcEngine.off(eventName, listener)", rtcEngine?.off);
    const rtmEngine = cfg.rtmConfig?.rtmEngine;
    if (rtmEngine) {
      assertFunction(
        "rtmEngine",
        "rtmEngine.publish(channelName, message, options?)",
        rtmEngine.publish
      );
      assertFunction(
        "rtmEngine",
        "rtmEngine.addEventListener(eventName, listener)",
        rtmEngine.addEventListener
      );
      assertFunction(
        "rtmEngine",
        "rtmEngine.removeEventListener(eventName, listener)",
        rtmEngine.removeEventListener
      );
    }
  }
  static async _doInit(cfg) {
    _AgoraVoiceAI._validateEngines(cfg);
    const reporter = cfg.enableAgoraMetrics ? new AgoraMetricsReporter() : new ConsoleMetricsReporter();
    if (reporter instanceof AgoraMetricsReporter) {
      await reporter.init();
    }
    if (_AgoraVoiceAI._instance?.rtcEngine) {
      _AgoraVoiceAI._instance.covSubRenderController.cleanup();
      _AgoraVoiceAI._instance.unsubscribe();
      _AgoraVoiceAI._instance.removeAllEventListeners();
    } else if (!_AgoraVoiceAI._instance) {
      _AgoraVoiceAI._instance = new _AgoraVoiceAI();
    }
    _AgoraVoiceAI._instance.rtcEngine = cfg.rtcEngine;
    _AgoraVoiceAI._instance.rtmEngine = cfg.rtmConfig?.rtmEngine ?? null;
    _AgoraVoiceAI._instance.renderMode = cfg.renderMode ?? "unknown" /* UNKNOWN */;
    _AgoraVoiceAI._instance.enableLog = cfg.enableLog ?? false;
    _AgoraVoiceAI._instance.setLogLevel(cfg.enableLog ? 2 /* DEBUG */ : 0 /* NONE */);
    _AgoraVoiceAI._instance.metricsReporter = reporter;
    return _AgoraVoiceAI._instance;
  }
  // ── Public Subscription Lifecycle ─────────────────────────────────────────
  /**
   * Subscribes to a message channel for real-time updates.
   *
   * This method binds the necessary RTC and RTM events, sets the channel,
   * and starts the CovSubRenderController to handle incoming messages.
   *
   * @remarks
   * - Must call {@link init} before using this method
   * - Throws error if not initialized
   *
   * @param channel - The channel to subscribe to for messages
   * @since 0.1.0
   */
  subscribeMessage(channel) {
    this.bindRtcEvents();
    if (this.rtmEngine) {
      this.bindRtmEvents();
    }
    this.channel = channel;
    this.covSubRenderController.setMode(this.renderMode);
    this.covSubRenderController.run();
    this._startEventTimeoutWarnings();
  }
  /**
   * Unsubscribes from the message channel and cleans up resources.
   * Safe to call even if {@link subscribeMessage} was not called — unbind
   * operations are guarded against null engines.
   *
   * @since 0.1.0
   */
  unsubscribe() {
    this._clearEventTimeout();
    this.unbindRtcEvents();
    if (this.rtmEngine) {
      this.unbindRtmEvents();
    }
    this.channel = null;
    this.covSubRenderController.cleanup();
    this.chunkedAssembler.clear();
  }
  /**
   * Destroys the AgoraVoiceAI instance and cleans up resources.
   * Safe to call multiple times — no-op if not initialized or already destroyed.
   * Only removes the toolkit's own event listeners from the RTC/RTM engines;
   * consumer-registered listeners are preserved.
   *
   * @since 0.1.0
   */
  destroy() {
    const instance = _AgoraVoiceAI._instance;
    if (!instance) return;
    instance.callMessagePrint("debug" /* debug */, `${_AgoraVoiceAI.NAME} destroyed`);
    instance._clearEventTimeout();
    instance.covSubRenderController.cleanup();
    instance.chunkedAssembler.clear();
    instance.unbindRtcEvents();
    instance.rtcEngine = null;
    instance.unbindRtmEvents();
    instance.rtmEngine = null;
    instance.renderMode = "unknown" /* UNKNOWN */;
    instance.channel = null;
    instance.removeAllEventListeners();
    _AgoraVoiceAI._instance = null;
  }
  // ── Public Chat API ───────────────────────────────────────────────────────
  /**
   * Sends a chat message to the conversational AI agent.
   *
   * @param agentUserId - The unique identifier of the agent user
   * @param message - The chat message to send, can be either text or image type
   * @returns A promise that resolves with the result of sending the message
   * @throws {Error} When an unsupported chat message type is provided
   *
   * @since 0.1.0
   *
   * @example
   * ```typescript
   * // Send a text message
   * const textMessage: IChatMessageText = {
   *   messageType: ChatMessageType.TEXT,
   *   priority: ChatMessagePriority.HIGH,
   *   responseInterruptable: true,
   *   text: "Hello, how are you?"
   * };
   * await api.chat("user123", textMessage);
   *
   * // Send an image message
   * const imageMessage: IChatMessageImage = {
   *   messageType: ChatMessageType.IMAGE,
   *   uuid: "msg-456",
   *   url: "https://example.com/image.jpg"
   * };
   * await api.chat("user123", imageMessage);
   * ```
   */
  async chat(agentUserId, message) {
    switch (message.messageType) {
      case "text" /* TEXT */:
        return this.sendText(agentUserId, message);
      case "image" /* IMAGE */:
        return this.sendImage(agentUserId, message);
      default:
        throw new ConversationalAIError(
          `Unsupported chat message type: ${message.messageType}. Supported types: TEXT, IMAGE.`
        );
    }
  }
  /**
   * Sends a text message to the specified agent user through RTM engine.
   *
   * @param agentUserId - The unique identifier of the agent user to send the message to
   * @param message - The chat message object containing text content and optional settings
   * @param message.priority - Optional priority level for the message (defaults to INTERRUPTED)
   * @param message.responseInterruptable - Optional flag indicating if the response can be interrupted (defaults to true)
   * @param message.text - The actual text content of the message
   *
   * @returns Promise that resolves when the message is successfully sent
   *
   * @throws {Error} Throws an error with message "failed to send chat message" if the RTM publish operation fails
   *
   * @since 0.1.0
   *
   * @example
   * ```typescript
   * await api.sendText('user123', {
   *   text: 'Hello, how can I help you?',
   *   priority: ChatMessagePriority.HIGH,
   *   responseInterruptable: false
   * });
   * ```
   */
  async sendText(agentUserId, message) {
    const traceId = genTraceID();
    this.callMessagePrint(
      "debug" /* debug */,
      `>>> [traceID:${traceId}] [chat] ${agentUserId}`,
      message
    );
    const rtmEngine = this.requireRTM("sendText");
    const payload = {
      priority: message.priority ?? "interrupted" /* INTERRUPTED */,
      interruptable: message.responseInterruptable ?? true,
      message: message.text ?? ""
    };
    try {
      const payloadStr = JSON.stringify(payload);
      const options = {
        channelType: "USER",
        customType: "user.transcription" /* USER_TRANSCRIPTION */
      };
      this.callMessagePrint(
        "debug" /* debug */,
        `msg: [traceID: ${traceId}] rtm publish`,
        payloadStr
      );
      const result = await rtmEngine.publish(agentUserId, payloadStr, options);
      this.callMessagePrint(
        "debug" /* debug */,
        `>>> [traceID:${traceId}] [chat]`,
        "successfully sent chat message",
        result
      );
    } catch (error) {
      this.callMessagePrint(
        "error" /* error */,
        `>>> [traceID:${traceId}] [chat]`,
        "failed to send chat message",
        error
      );
      throw new ConversationalAIError(
        `Failed to send chat message: ${error.message ?? error}`,
        { cause: error }
      );
    }
  }
  /**
   * Sends an image message to a specific agent user through RTM (Real-Time Messaging).
   *
   * @param agentUserId - The unique identifier of the agent user to send the image to
   * @param message - The image message object containing UUID and either URL or base64 data
   * @param message.uuid - Unique identifier for the message
   * @param message.url - Optional URL of the image to send
   * @param message.base64 - Optional base64 encoded image data
   *
   * @throws {Error} Throws an error with message "failed to send chat message" if the RTM publish operation fails
   *
   * @returns Promise that resolves when the image message is successfully sent
   *
   * @since 0.1.0
   *
   * @example
   * ```typescript
   * await sendImage('user123', {
   *   uuid: 'msg-456',
   *   url: 'https://example.com/image.jpg'
   * });
   * ```
   */
  async sendImage(agentUserId, message) {
    const traceId = genTraceID();
    this.callMessagePrint(
      "debug" /* debug */,
      `>>> [traceID:${traceId}] [chat] ${agentUserId}`,
      message
    );
    const rtmEngine = this.requireRTM("sendImage");
    const payload = {
      uuid: message.uuid,
      image_url: message?.url || "",
      image_base64: message?.base64 || ""
    };
    try {
      const payloadStr = JSON.stringify(payload);
      const options = {
        channelType: "USER",
        customType: "image.upload" /* IMAGE_UPLOAD */
      };
      this.callMessagePrint(
        "debug" /* debug */,
        `msg: [traceID: ${traceId}] rtm publish`,
        payloadStr
      );
      const result = await rtmEngine.publish(agentUserId, payloadStr, options);
      this.callMessagePrint(
        "debug" /* debug */,
        `>>> [traceID:${traceId}] [chat]`,
        "successfully sent image message",
        result
      );
    } catch (error) {
      this.callMessagePrint(
        "error" /* error */,
        `>>> [traceID:${traceId}] [chat]`,
        "failed to send image message",
        error
      );
      throw new ConversationalAIError(
        `Failed to send image message: ${error.message ?? error}`,
        { cause: error }
      );
    }
  }
  /**
   * Sends an interrupt message to the specified agent user.
   *
   * This method publishes an interrupt message to the RTM channel of the specified agent user.
   * It is used to signal that the current interaction should be interrupted.
   *
   * @remarks
   * - Must call {@link init} before using this method
   * - Throws error if not initialized or if sending fails
   *
   * @param agentUserId - The user ID of the agent to interrupt
   * @since 0.1.0
   */
  async interrupt(agentUserId) {
    const traceId = genTraceID();
    this.callMessagePrint("debug" /* debug */, `>>> [traceID:${traceId}] [interrupt]`, agentUserId);
    const rtmEngine = this.requireRTM("interrupt");
    const options = {
      channelType: "USER",
      customType: "message.interrupt" /* MSG_INTERRUPTED */
    };
    const messageStr = JSON.stringify({
      customType: "message.interrupt" /* MSG_INTERRUPTED */
    });
    try {
      const result = await rtmEngine.publish(agentUserId, messageStr, options);
      this.callMessagePrint(
        "debug" /* debug */,
        `>>> [traceID:${traceId}] [interrupt]`,
        "successfully sent interrupt message",
        result
      );
    } catch (error) {
      this.callMessagePrint(
        "error" /* error */,
        `>>> [traceID:${traceId}] [interrupt]`,
        "failed to send interrupt message",
        error
      );
      throw new ConversationalAIError(
        `Failed to send interrupt: ${error.message ?? error}`,
        { cause: error }
      );
    }
  }
  // ── Internal Event Emitters (Render Controller -> Public API) ────────────
  onChatHistoryUpdated(chatHistory) {
    this.callMessagePrint(
      "debug" /* debug */,
      `>>> ${"transcript-updated" /* TRANSCRIPT_UPDATED */}`,
      chatHistory
    );
    this.emit("transcript-updated" /* TRANSCRIPT_UPDATED */, chatHistory);
  }
  onAgentStateChanged(agentUserId, event) {
    this.callMessagePrint(
      "debug" /* debug */,
      `>>> ${"agent-state-changed" /* AGENT_STATE_CHANGED */}`,
      agentUserId,
      event
    );
    this.emit("agent-state-changed" /* AGENT_STATE_CHANGED */, agentUserId, event);
  }
  onAgentInterrupted(agentUserId, event) {
    this.callMessagePrint(
      "debug" /* debug */,
      `>>> ${"agent-interrupted" /* AGENT_INTERRUPTED */}`,
      agentUserId,
      event
    );
    this.emit("agent-interrupted" /* AGENT_INTERRUPTED */, agentUserId, event);
  }
  onDebugLog(message) {
    this.emit("debug-log" /* DEBUG_LOG */, message);
  }
  onAgentMetrics(agentUserId, metrics) {
    this.callMessagePrint(
      "debug" /* debug */,
      `>>> ${"agent-metrics" /* AGENT_METRICS */}`,
      agentUserId,
      metrics
    );
    this.emit("agent-metrics" /* AGENT_METRICS */, agentUserId, metrics);
  }
  onAgentError(agentUserId, error) {
    this.callMessagePrint(
      "error" /* error */,
      `>>> ${"agent-error" /* AGENT_ERROR */}`,
      agentUserId,
      error
    );
    this.emit("agent-error" /* AGENT_ERROR */, agentUserId, error);
  }
  onMessageReceiptUpdated(agentUserId, messageReceipt) {
    this.callMessagePrint(
      "debug" /* debug */,
      `>>> ${"message-receipt-updated" /* MESSAGE_RECEIPT_UPDATED */}`,
      agentUserId,
      messageReceipt
    );
    this.emit("message-receipt-updated" /* MESSAGE_RECEIPT_UPDATED */, agentUserId, messageReceipt);
  }
  onMessageError(agentUserId, error) {
    this.callMessagePrint(
      "error" /* error */,
      `>>> ${"message-error" /* MESSAGE_ERROR */}`,
      agentUserId,
      error
    );
    this.emit("message-error" /* MESSAGE_ERROR */, agentUserId, error);
  }
  onMessageSalStatus(agentUserId, message) {
    this.callMessagePrint(
      "debug" /* debug */,
      `>>> ${"message-sal-status" /* MESSAGE_SAL_STATUS */}`,
      agentUserId,
      message
    );
    this.emit("message-sal-status" /* MESSAGE_SAL_STATUS */, agentUserId, message);
  }
  // ── Internal Diagnostics (Dev-only warnings) ─────────────────────────────
  _clearEventTimeout() {
    if (this._eventTimeoutId !== null) {
      clearTimeout(this._eventTimeoutId);
      this._eventTimeoutId = null;
    }
    if (this._trackTranscriptHandler) {
      this.off(
        "transcript-updated" /* TRANSCRIPT_UPDATED */,
        this._trackTranscriptHandler
      );
      this._trackTranscriptHandler = null;
    }
    if (this._trackStateHandler) {
      this.off(
        "agent-state-changed" /* AGENT_STATE_CHANGED */,
        this._trackStateHandler
      );
      this._trackStateHandler = null;
    }
  }
  // Dev-only: warns after 15s if no TRANSCRIPT_UPDATED or AGENT_STATE_CHANGED
  // events arrive. Helps diagnose misconfigured channels or missing RTM setup.
  _startEventTimeoutWarnings() {
    if (process.env.NODE_ENV === "production") return;
    this._clearEventTimeout();
    const receivedEvents = /* @__PURE__ */ new Set();
    const trackEvent = (event) => () => {
      receivedEvents.add(event);
    };
    const trackTranscript = trackEvent("TRANSCRIPT_UPDATED");
    const trackState = trackEvent("AGENT_STATE_CHANGED");
    this._trackTranscriptHandler = trackTranscript;
    this._trackStateHandler = trackState;
    this.on(
      "transcript-updated" /* TRANSCRIPT_UPDATED */,
      trackTranscript
    );
    this.on(
      "agent-state-changed" /* AGENT_STATE_CHANGED */,
      trackState
    );
    this._eventTimeoutId = setTimeout(() => {
      this.off(
        "transcript-updated" /* TRANSCRIPT_UPDATED */,
        trackTranscript
      );
      this.off(
        "agent-state-changed" /* AGENT_STATE_CHANGED */,
        trackState
      );
      this._trackTranscriptHandler = null;
      this._trackStateHandler = null;
      this._eventTimeoutId = null;
      if (!receivedEvents.has("TRANSCRIPT_UPDATED")) {
        console.warn(
          "[ConversationalAI] No TRANSCRIPT_UPDATED events received after 15s. Ensure the agent is running and connected to the same channel. If using WORD mode, verify ENABLE_AUDIO_PTS_METADATA is set before creating the RTC client."
        );
      }
      if (this.rtmEngine && !receivedEvents.has("AGENT_STATE_CHANGED")) {
        console.warn(
          '[ConversationalAI] No AGENT_STATE_CHANGED events received after 15s (RTM is configured). Ensure the agent was started with advanced_features.enable_rtm: true and parameters.data_channel: "rtm".'
        );
      }
    }, 15e3);
  }
  // ── Engine Event Binding ──────────────────────────────────────────────────
  bindRtcEvents() {
    this.getCfg().rtcEngine.on("audio-pts" /* AUDIO_PTS */, this._boundHandleRtcAudioPTS);
    this.getCfg().rtcEngine.on("stream-message" /* STREAM_MESSAGE */, this._boundHandleRtcStreamMessage);
  }
  unbindRtcEvents() {
    this.rtcEngine?.off("audio-pts" /* AUDIO_PTS */, this._boundHandleRtcAudioPTS);
    this.rtcEngine?.off("stream-message" /* STREAM_MESSAGE */, this._boundHandleRtcStreamMessage);
  }
  bindRtmEvents() {
    this.rtmEngine.addEventListener("message" /* MESSAGE */, this._boundHandleRtmMessage);
    this.rtmEngine.addEventListener("presence" /* PRESENCE */, this._boundHandleRtmPresence);
    this.rtmEngine.addEventListener("status" /* STATUS */, this._boundHandleRtmStatus);
  }
  unbindRtmEvents() {
    const events = ["message" /* MESSAGE */, "presence" /* PRESENCE */, "status" /* STATUS */];
    const handlers = [
      this._boundHandleRtmMessage,
      this._boundHandleRtmPresence,
      this._boundHandleRtmStatus
    ];
    for (let i = 0; i < events.length; i++) {
      try {
        this.rtmEngine?.removeEventListener(events[i], handlers[i]);
      } catch (e) {
        this.callMessagePrint("warn" /* warn */, "Failed to unbind RTM event", events[i], e);
      }
    }
  }
  // ── Low-level Engine Handlers ─────────────────────────────────────────────
  _handleRtcAudioPTS(pts) {
    try {
      this.callMessagePrint("debug" /* debug */, `<<< ${"audio-pts" /* AUDIO_PTS */}`, pts);
      this.covSubRenderController.setPts(pts);
    } catch (error) {
      this.callMessagePrint("error" /* error */, `<<< ${"audio-pts" /* AUDIO_PTS */}`, pts, error);
    }
  }
  _handleRtcStreamMessage(uid, stream) {
    try {
      const decoder = new TextDecoder("utf-8");
      const text = decoder.decode(stream);
      this.callMessagePrint(
        "debug" /* debug */,
        `<<< ${"stream-message" /* STREAM_MESSAGE */}`,
        `uid: ${uid}, length: ${text.length}`
      );
      if ((text.match(/\|/g) || []).length === 3) {
        const assembled = this.chunkedAssembler.assemble(text);
        if (assembled !== null) {
          this.covSubRenderController.handleMessage(assembled, {
            publisher: String(uid)
          });
        }
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        this.callMessagePrint(
          "warn" /* warn */,
          `<<< ${"stream-message" /* STREAM_MESSAGE */}`,
          "Failed to parse stream message",
          text
        );
        return;
      }
      try {
        this.covSubRenderController.handleMessage(parsed, {
          publisher: String(uid)
        });
      } catch (e) {
        this.callMessagePrint(
          "error" /* error */,
          `<<< ${"stream-message" /* STREAM_MESSAGE */}`,
          "Error handling stream message",
          e
        );
      }
    } catch (error) {
      this.callMessagePrint("error" /* error */, `<<< ${"stream-message" /* STREAM_MESSAGE */}`, error);
    }
  }
  _handleRtmMessage(message) {
    const traceId = genTraceID();
    this.callMessagePrint(
      "debug" /* debug */,
      `>>> [traceID:${traceId}] ${"message" /* MESSAGE */}`,
      `Publisher: ${message.publisher}, type: ${message.messageType}`
    );
    const messageData = message.message;
    let parsedMessage;
    if (typeof messageData === "string") {
      try {
        parsedMessage = JSON.parse(messageData);
      } catch {
        this.callMessagePrint(
          "warn" /* warn */,
          `>>> [traceID:${traceId}] ${"message" /* MESSAGE */}`,
          "Failed to parse RTM message",
          messageData
        );
        return;
      }
    } else if (messageData instanceof Uint8Array) {
      try {
        const decoder = new TextDecoder("utf-8");
        const messageString = decoder.decode(messageData);
        parsedMessage = JSON.parse(messageString);
      } catch {
        this.callMessagePrint(
          "warn" /* warn */,
          `>>> [traceID:${traceId}] ${"message" /* MESSAGE */}`,
          "Failed to parse RTM binary message"
        );
        return;
      }
    } else {
      this.callMessagePrint(
        "warn" /* warn */,
        `>>> [traceID:${traceId}] ${"message" /* MESSAGE */}`,
        "Unsupported message type received"
      );
      return;
    }
    this.callMessagePrint(
      "debug" /* debug */,
      `>>> [traceID:${traceId}] ${"message" /* MESSAGE */}`,
      parsedMessage
    );
    try {
      this.covSubRenderController.handleMessage(parsedMessage, {
        publisher: message.publisher
      });
    } catch (e) {
      this.callMessagePrint(
        "error" /* error */,
        `>>> [traceID:${traceId}] ${"message" /* MESSAGE */}`,
        "Error handling RTM message",
        e
      );
    }
  }
  _handleRtmPresence(presence) {
    const traceId = genTraceID();
    this.callMessagePrint(
      "debug" /* debug */,
      `>>> [traceID:${traceId}] ${"presence" /* PRESENCE */}`,
      `Publisher: ${presence.publisher}`
    );
    const stateChanged = presence.stateChanged;
    if (stateChanged && typeof stateChanged.state === "string" && typeof stateChanged.turn_id !== "undefined") {
      this.callMessagePrint(
        "debug" /* debug */,
        `>>> [traceID:${traceId}] ${"presence" /* PRESENCE */}`,
        `State changed: ${stateChanged.state}, Turn ID: ${stateChanged.turn_id}, timestamp: ${presence.timestamp}`
      );
      this.covSubRenderController.handleAgentStatus({
        ...presence,
        stateChanged: {
          state: stateChanged.state,
          turn_id: String(stateChanged.turn_id)
        }
      });
    } else {
      this.callMessagePrint(
        "debug" /* debug */,
        `>>> [traceID:${traceId}] ${"presence" /* PRESENCE */}`,
        "No state change detected, skipping handling presence event"
      );
    }
  }
  _handleRtmStatus(status) {
    const traceId = genTraceID();
    this.callMessagePrint(
      "debug" /* debug */,
      `>>> [traceID:${traceId}] ${"status" /* STATUS */}`,
      status
    );
  }
};
_AgoraVoiceAI.NAME = TAG2;
_AgoraVoiceAI.VERSION = VERSION;
_AgoraVoiceAI._instance = null;
_AgoraVoiceAI._initPromise = null;
var AgoraVoiceAI = _AgoraVoiceAI;

export { AgentState, AgoraMetricsReporter, AgoraVoiceAI, AgoraVoiceAIEvents, ChatMessagePriority, ChatMessageType, ChunkedMessageAssembler, ConsoleMetricsReporter, ConversationalAIError, CovSubRenderController, EventLogLevel, LocalTranscriptStatus, MessageSalStatus, MessageType, ModuleType, NotFoundError, NotInitializedError, RTMRequiredError, TranscriptHelperMode, TurnStatus };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map