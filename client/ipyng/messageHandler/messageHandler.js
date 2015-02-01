angular.module('ipyng.messageHandler', ['ipyng.websocket', 'ipyng.utils', 'ng.lodash'])
  .factory('ipyMessageHandler', ['ipyWebsocketHandler', 'ipyMessage', 'ipyKernelPath', 'ipyUtils', '$location', '$q', '_',
    function (ipyWebsocketHandler, ipyMessage, ipyKernelPath, ipyUtils, $location, $q, _) {
      var ipyMessageHandler = {};

      ipyMessageHandler.hostname = $location.host();
      ipyMessageHandler.username = "username";
      ipyMessageHandler.session = _.uniqueId();
      ipyMessage.configure(ipyMessageHandler.username, ipyMessageHandler.session);

      ipyMessageHandler.wsUrl = function (kernelID, endpoint) {
        return ipyUtils.url_path_join("ws://" + ipyMessageHandler.hostname, ipyKernelPath, kernelID, endpoint);
      };

      ipyMessageHandler.httpUrl = function (kernelID, endpoint) {
        return ipyUtils.url_path_join("http://" + ipyMessageHandler.hostname, ipyKernelPath, kernelID, endpoint);
      };

      ipyMessageHandler.shellUrl = function (kernelID) {
        return ipyMessageHandler.wsUrl(kernelID, 'shell');
      };

      ipyMessageHandler.stdinUrl = function (kernelID) {
        return ipyMessageHandler.wsUrl(kernelID, 'stdin');
      };

      ipyMessageHandler.iopubUrl = function (kernelID) {
        return ipyMessageHandler.wsUrl(kernelID, 'iopub');
      };

      ipyMessageHandler.deferredRequests = {};
      ipyMessageHandler.sendShellRequest = function (kernelID, message) {
        var deferred, msgID;
        deferred = $q.defer();
        msgID = ipyMessage.getMessageID(message);
        ipyMessageHandler.deferredRequests[msgID] = deferred;
        ipyWebsocketHandler.send(ipyMessageHandler.shellUrl(kernelID), JSON.stringify(message));
        return deferred.promise;
      };

      ipyMessageHandler.handleShellReply = function (event) {
        var message, parentID;
        message = event.data;
        parentID = ipyMessage.getParentMessageID(message);
        ipyMessageHandler.deferredRequests[parentID].resolve(message);
        delete ipyMessageHandler.deferredRequests[parentID];
      };

      ipyMessageHandler.handleIopubMessage = function (event) {
        var message = event.data;
        var parentID = ipyMessage.getParentMessageID(message);
        ipyMessageHandler.deferredRequests[parentID].notify(message);
      };

      ipyMessageHandler.handleStdinRequest = function (event) {
        var message = event.data;
        var parentID = ipyMessage.getParentMessageID(message);
        ipyMessageHandler.deferredRequests[parentID].notify(message);
      };

      ipyMessageHandler.sendConnectRequest = function (kernelID) {
        var shellUrl = ipyMessageHandler.shellUrl(kernelID);
        var iopubUrl = ipyMessageHandler.iopubUrl(kernelID);
        var stdinUrl = ipyMessageHandler.stdinUrl(kernelID);
        ipyWebsocketHandler.registerOnMessageCallback(shellUrl, ipyMessageHandler.handleShellReply);
        ipyWebsocketHandler.registerOnMessageCallback(iopubUrl, ipyMessageHandler.handleIopubMessage);
        ipyWebsocketHandler.registerOnMessageCallback(stdinUrl, ipyMessageHandler.handleStdinRequest);
        var startMessage = JSON.stringify(ipyMessage.makeStartMessage());
        ipyWebsocketHandler.send(shellUrl, startMessage);
        ipyWebsocketHandler.send(iopubUrl, startMessage);
        ipyWebsocketHandler.send(stdinUrl, startMessage);
      };

      return ipyMessageHandler;
    }
  ])
  .factory('ipyMessage', ['_', function (_) {
    var ipyMessage = {};

    ipyMessage.configure = function (username, session) {
      ipyMessage.username = username;
      ipyMessage.session = session;
    };

    ipyMessage.getMessageID = function (message) {
      return message.header.msg_id;
    };

    ipyMessage.getParentMessageID = function (message) {
      return message.parent_header.msg_id;
    };

    ipyMessage.getMessageType = function (message) {
      return message.header.msg_type;
    };

    ipyMessage.getContent = function (message) {
      return message.content;
    };

    ipyMessage.getHeader = function(message) {
      return message.header;
    };

    ipyMessage.makeMessage = function (messageType, content, parentHeader, metadata, username, session) {
      username = _.isUndefined(username) ? ipyMessage.username : username;
      session = _.isUndefined(session) ? ipyMessage.session : session;

      return {
        'header': {
          'msg_id': _.uniqueId(), // uuid
          'username': username, // str
          'session': session, // uuid
          'msg_type': messageType, // str
          'version': '5.0'
        },
        'parent_header': parentHeader, // dict
        'metadata': metadata, // dict
        'content': content // dict
      };
    };

    ipyMessage.makeExecuteMessage = function (code, silent, storeHistory, userExpressions, allowStdin, username, session) {
      silent = _.isUndefined(silent) ? false : silent;
      storeHistory = _.isUndefined(storeHistory) ? true : storeHistory;
      userExpressions = _.isUndefined(userExpressions) ? {} : userExpressions;
      allowStdin = _.isUndefined(allowStdin) ? true : allowStdin;
      var content = {
        'code': code,
        'silent': silent,
        'store_history': storeHistory,
        'user_expressions': userExpressions,
        'allow_stdin': allowStdin
      };
      return ipyMessage.makeMessage('execute_request', content, {}, {}, username, session);
    };

    ipyMessage.makeExecuteReply = function(status, executionCount, userExpressions, payload, username, session){
      var content = {
        status: status,
        execution_count: executionCount,
        user_expressions: userExpressions,
        payload: payload
      };
      return ipyMessage.makeMessage('execute_reply', content, {}, {}, username, session);
    };

    ipyMessage.makeExecuteResult = function(executionCount, data, metadata, parentHeader, username, session){
      var content = {
        execution_count: executionCount,
        data: data, // Format of {MIMEtype: data}
        metadata: metadata // Stores something like {'image/png': { 'width': 640, 'height': 480}}
      };
      return ipyMessage.makeMessage('execute_result', content, parentHeader, {}, username, session);
    };

    ipyMessage.makeInspectMessage = function (code, cursorPosition, detailLevel, username, session) {
      detailLevel = _.isUndefined(detailLevel) ? 0 : detailLevel;
      var content = {
        'code': code,
        'cursor_pos': cursorPosition,
        'detail_level': detailLevel
      };
      return ipyMessage.makeMessage('inspect_request', content, {}, {}, username, session);
    };

    ipyMessage.makeInspectReply = function (status, data, metadata, parentHeader, username, session) {
      var content = {
        status: status,
        data: data,
        metadata: metadata
      };
      return ipyMessage.makeMessage('inspect_reply', content, parentHeader, {}, username, session);
    };

    ipyMessage.makeCompleteMessage = function (code, cursorPosition, username, session) {
      var content = {
        'code': code,
        'cursor_pos': cursorPosition
      };
      return ipyMessage.makeMessage('complete_request', content, {}, {}, username, session);
    };

    ipyMessage.makeHistoryMessage = function (output, raw, historyAccessType, histSession, start, stop, lastN, pattern, unique, username, session) {
      output = _.isUndefined(output) ? true : output;
      raw = _.isUndefined(raw) ? false : raw;
      histSession = _.isUndefined(histSession) ? ipyMessage.session : histSession;
      start = _.isUndefined(start) ? '' : start;
      stop = _.isUndefined(stop) ? '' : stop;
      lastN = _.isUndefined(lastN) ? '' : lastN;
      pattern = _.isUndefined(pattern) ? '' : pattern;
      unique = _.isUndefined(unique) ? false : unique;
      var content = {
        'output': output,
        'raw': raw,
        'hist_access_type': historyAccessType,
        'session': histSession,
        'start': start,
        'stop': stop,
        'n': lastN,
        'pattern': pattern,
        'unique': unique
      };
      return ipyMessage.makeMessage('history_request', content, {}, {}, username, session);
    };

    ipyMessage.makeHistoryReply = function (history, username, session) {
      var content = {
        history: history
      };
      return ipyMessage.makeMessage('history_reply', content, {}, {}, username, session);
    };

    ipyMessage.makeConnectMessage = function (username, session) {
      return ipyMessage.makeMessage('connect_request', {}, {}, {}, username, session);
    };

    ipyMessage.makeStartMessage = function (username, session) {
      session = _.isUndefined ? ipyMessage.session : session;
      return session + ':';
    };

    ipyMessage.makeKernelInfoMessage = function (username, session) {
      return ipyMessage.makeMessage('kernel_info_request', username, session);
    };

    ipyMessage.makeKernelShutdownMessage = function (restart, username, session) {
      var content = {'restart': restart};
      return ipyMessage.makeMessage('shutdown_request', content, {}, {}, username, session);
    };

    ipyMessage.makeStreamMessage = function (name, data, username, session) {
      var content = {
        'name': name,
        'data': data
      };
      return ipyMessage.makeMessage('stream', content, {}, {}, username, session);
    };

    ipyMessage.makeInputMessage = function (value, parentHeader, username, session) {
      var content = {'value': value};
      return ipyMessage.makeMessage('input_reply', content, parentHeader, {}, username, session);
    };

    return ipyMessage;
  }])
  .value('ipyKernelPath', 'api/kernels/')
;