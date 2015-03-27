angular.module('ipyng.messageHandler', ['ipyng.messageHandler.websocket', 'ipyng.utils', 'ng.lodash'])
  .factory('ipySessionId', function(_){
    return _.uniqueId();
  })
  .factory('ipyUsername', function(){
    return '';
  })
  .factory('ipyMessageHandler', function (ipyWebsocketHandler, ipyMessage, ipyKernelPath, ipyUtils,
                                          ipySessionId, $location, $q, _, $timeout) {
    var ipyMessageHandler = {};

    ipyMessageHandler.channelUrl = function (kernelGuid) {
      return ipyUtils.url_path_join("ws://" + $location.host() + ":" + $location.port(), ipyKernelPath, kernelGuid,
        'channels?session_id=' + ipySessionId);
    };

    ipyMessageHandler.httpUrl = function (kernelGuid, endpoint) {
      return ipyUtils.url_path_join("http://" + $location.host() + ":" + $location.port(), ipyKernelPath, kernelGuid, endpoint);
    };


    var shellHandlers = {};
    var ShellHandler = function(kernelGuid, message, iopubHandler, stdinHandler) {
      this.msgId = ipyMessage.getMessageID(message);
      shellHandlers[this.msgId] = this;
      this.reply = $q.defer();
      this.idle = $q.defer();
      this.iopubHandler = iopubHandler || _.noop;
      this.stdinHandler = stdinHandler; // Dunno what to do if this is empty and stdin is required. Guess we'll hang.
    };

    ipyMessageHandler.sendShellRequest = function (kernelGuid, message, stdinHandler, stdoutHandler) {
      var msgId = ipyMessage.getHeader(message);
      var handler = new ShellHandler(kernelGuid, message, stdinHandler, stdoutHandler);
      msgId = ipyMessage.getMessageID(message);

      // We only want to resolve the shell request after the engine declares itself idle
      // and the execute_result has returned.
      // This is assuming all the execute_result and display_data messages are sent before
      // this condition is met...
      $q.all([handler.reply.promise, handler.idle.promise])
        .then(function(results){
          $timeout(function(){
            delete shellHandlers[msgId];
          });
        });
      ipyWebsocketHandler.send(ipyMessageHandler.channelUrl(kernelGuid), ipyMessage.stringifyMessage(message));
      return handler.reply.promise;
    };

    ipyMessageHandler.handleShellReply = function (message) {
      var parentId = ipyMessage.getParentMessageID(message);
      shellHandlers[parentId].idle.promise
        .then(function(result){
          shellHandlers[parentId].reply.resolve(message);
        });
    };

    ipyMessageHandler.handleIopubMessage = function (message) {
      var parentId = ipyMessage.getParentMessageID(message);
      shellHandlers[parentId].iopubHandler(message);
      if(ipyMessage.getMessageType(message) == 'status' && ipyMessage.getContent(message).execution_state == 'idle' ) {
        shellHandlers[parentId].idle.resolve();
      }
    };

    ipyMessageHandler.handleStdinRequest = function (message) {
      var parentId = ipyMessage.getParentMessageID(message);
      var guid = ipyMessage.getKernelGuid(message);
      $q.when(shellHandlers[parentId].stdinHandler(message))
        .then(function(response){
          ipyWebsocketHandler.send(ipyMessageHandler.channelUrl(guid), ipyMessage.stringifyMessage(response));
        });
    };

    ipyMessageHandler.handleChannelReply = function(event, url) {
      var message = ipyMessage.parseMessage(event.data, kernelGuids[url]);
      if(message.channel == 'shell') ipyMessageHandler.handleShellReply(message);
      else if (message.channel == 'iopub') ipyMessageHandler.handleIopubMessage(message);
      else if (message.channel == 'stdin') ipyMessageHandler.handleStdinRequest(message);
      else throw "Unknown channel";
    };

    var kernelGuids = {};
    ipyMessageHandler.registerChannel = function (kernelGuid) {
      var url = ipyMessageHandler.channelUrl(kernelGuid);
      kernelGuids[url] = kernelGuid;
      return ipyWebsocketHandler.registerOnMessageCallback(url, ipyMessageHandler.handleChannelReply);
    };

    return ipyMessageHandler;
  })
  .factory('ipyMessage', function (_, ipySessionId, ipyUsername) {
    var ipyMessage = {};

    ipyMessage.getMessageID = function (message) {
      return message.header.msg_id;
    };

    ipyMessage.getParentMessageID = function (message) {
      return message.parent_header.msg_id;
    };

    ipyMessage.getMessageType = function (message) {
      return message.header.msg_type;
    };

    ipyMessage.getSession = function(message) {
      return message.header.session;
    };

    ipyMessage.getContent = function (message) {
      return message.content;
    };

    ipyMessage.getHeader = function(message) {
      return message.header;
    };

    ipyMessage.getParentHeader = function(message) {
      return message.parent_header;
    };

    ipyMessage.parseMessage = function(data, kernelGuid) {
      var message = JSON.parse(data);
      message.kernel_guid = kernelGuid;
      return message;
    };

    ipyMessage.getKernelGuid = function(message) {
      return message.kernel_guid;
    };

    ipyMessage.makeMessage = function (messageType, content, parentHeader, channel, metadata) {
      return {
        'header': {
          'msg_id': _.uniqueId(), // uuid
          'username': ipyUsername, // str
          'session': ipySessionId, // uuid
          'msg_type': messageType, // str
          'version': '5.0'
        },
        'parent_header': _.isUndefined(parentHeader) ? {} : parentHeader, //
        'channel': _.isUndefined(channel) ? 'shell' : channel,
        'metadata': _.isUndefined(metadata) ? {} : metadata, // dict
        'content': _.isUndefined(content) ? {} : content // dict
      };
    };

    ipyMessage.makeExecuteMessage = function (code, silent, storeHistory, userExpressions, allowStdin) {
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
      return ipyMessage.makeMessage('execute_request', content);
    };

    ipyMessage.makeExecuteReply = function(status, executionCount, userExpressions, payload, parentHeader, traceback){
      var content = {
        status: status,
        execution_count: executionCount,
        user_expressions: userExpressions,
        payload: payload
      };
      if(traceback) content.traceback = traceback;
      return ipyMessage.makeMessage('execute_reply', content, parentHeader);
    };

    ipyMessage.makeExecuteResult = function(data, executionCount, metadata, parentHeader){
      var content = {
        data: data, // Format of {MIMEtype: data}
        execution_count: executionCount,
        metadata: metadata // Stores something like {'image/png': { 'width': 640, 'height': 480}}
      };
      return ipyMessage.makeMessage('execute_result', content, parentHeader, 'iopub');
    };

    ipyMessage.makeIopubStream = function(text, parentHeader) {
      var content = {
        text: text,
        name: 'stdout'
      };
      return ipyMessage.makeMessage('stream', content, parentHeader);
    };

    ipyMessage.makeIopubDisplay = function(data, parentHeader) {
      var content = {
        data: data
      };
      return ipyMessage.makeMessage('display_data', content, parentHeader);
    };

    ipyMessage.makeInspectMessage = function (code, cursorPosition, detailLevel) {
      detailLevel = _.isUndefined(detailLevel) ? 0 : detailLevel;
      var content = {
        'code': code,
        'cursor_pos': cursorPosition,
        'detail_level': detailLevel
      };
      return ipyMessage.makeMessage('inspect_request', content);
    };

    ipyMessage.makeInspectReply = function (status, data, metadata, parentHeader) {
      var content = {
        status: status,
        data: data,
        metadata: metadata
      };
      return ipyMessage.makeMessage('inspect_reply', content, parentHeader);
    };

    ipyMessage.makeCompleteMessage = function (code, cursorPosition) {
      var content = {
        'code': code,
        'cursor_pos': cursorPosition
      };
      return ipyMessage.makeMessage('complete_request', content);
    };

    ipyMessage.makeHistoryMessage = function (output, raw, historyAccessType, start, stop, lastN, pattern, unique) {
      output = _.isUndefined(output) ? true : output;
      raw = _.isUndefined(raw) ? false : raw;
      start = _.isUndefined(start) ? '' : start;
      stop = _.isUndefined(stop) ? '' : stop;
      lastN = _.isUndefined(lastN) ? '' : lastN;
      pattern = _.isUndefined(pattern) ? '' : pattern;
      unique = _.isUndefined(unique) ? false : unique;
      var content = {
        'output': output,
        'raw': raw,
        'hist_access_type': historyAccessType,
        'session': ipySessionId,
        'start': start,
        'stop': stop,
        'n': lastN,
        'pattern': pattern,
        'unique': unique
      };
      return ipyMessage.makeMessage('history_request', content);
    };

    ipyMessage.makeHistoryReply = function (history, parentHeader) {
      var content = {
        history: history
      };
      return ipyMessage.makeMessage('history_reply', content, parentHeader);
    };

    ipyMessage.makeKernelInfoMessage = function () {
      return ipyMessage.makeMessage('kernel_info_request');
    };

    ipyMessage.makeKernelShutdownMessage = function (restart) {
      var content = {'restart': restart};
      return ipyMessage.makeMessage('shutdown_request', content);
    };

    ipyMessage.makeStreamMessage = function (name, data) {
      var content = {
        'name': name,
        'data': data
      };
      return ipyMessage.makeMessage('stream', content);
    };
    ipyMessage.makeStatusReply = function(status, parentHeader) {
      var content = {execution_state: status};
      return ipyMessage.makeMessage('status', content, parentHeader, 'iopub');
    };

    ipyMessage.makeInputRequest = function(prompt, password, parentHeader) {
      var content = {prompt: prompt, password: password};
      return ipyMessage.makeMessage('input_request', content, parentHeader, 'stdin');
    };

    ipyMessage.makeInputReply = function (value, parentHeader) {
      var content = {'value': value};
      return ipyMessage.makeMessage('input_reply', content, parentHeader, 'stdin');
    };

    ipyMessage.stringifyMessage = function(message) {
      return JSON.stringify(message);
    };

    return ipyMessage;
  })
  .value('ipyKernelPath', 'api/kernels/')
;