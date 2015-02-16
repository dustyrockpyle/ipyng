angular.module('ipyng.kernel.messageHandler', ['ipyng.kernel.messageHandler.websocket', 'ipyng.utils', 'ng.lodash'])
  .factory('ipySessionId', function(_){
    return _.uniqueId();
  })
  .factory('ipyUsername', function(){
    return '';
  })
  .factory('ipyMessageHandler', function (ipyWebsocketHandler, ipyMessage, ipyKernelPath, ipyUtils, $location, $q, _, $timeout) {
    var ipyMessageHandler = {};

    ipyMessageHandler.wsUrl = function (kernelGuid, endpoint) {
      return ipyUtils.url_path_join("ws://" + $location.host() + ":" + $location.port(), ipyKernelPath, kernelGuid, endpoint);
    };

    ipyMessageHandler.httpUrl = function (kernelGuid, endpoint) {
      return ipyUtils.url_path_join("http://" + $location.host() + ":" + $location.port(), ipyKernelPath, kernelGuid, endpoint);
    };

    ipyMessageHandler.shellUrl = function (kernelGuid) {
      return ipyMessageHandler.wsUrl(kernelGuid, 'shell');
    };

    ipyMessageHandler.stdinUrl = function (kernelGuid) {
      return ipyMessageHandler.wsUrl(kernelGuid, 'stdin');
    };

    ipyMessageHandler.iopubUrl = function (kernelGuid) {
      return ipyMessageHandler.wsUrl(kernelGuid, 'iopub');
    };

    var deferredRequests = {};
    ipyMessageHandler.sendShellRequest = function (kernelGuid, message) {
      var deferred, msgID;
      deferred = $q.defer();
      msgID = ipyMessage.getMessageID(message);
      deferredRequests[msgID] = deferred;
      ipyWebsocketHandler.send(ipyMessageHandler.shellUrl(kernelGuid), JSON.stringify(message));
      return deferred.promise;
    };

    ipyMessageHandler.handleShellReply = function (event) {
      var message, parentID;
      message = JSON.parse(event.data);
      parentID = ipyMessage.getParentMessageID(message);
      deferredRequests[parentID].resolve(message);
      $timeout(function(){ delete deferredRequests[parentID];}, 2000);
      // Not totally happy with this; but it seems status message can be sent after execute_reply is received,
      // should probably have kernel manager inform the message handler when it's ok to delete the promise;
    };

    ipyMessageHandler.handleIopubMessage = function (event) {
      var message = JSON.parse(event.data);
      var parentID = ipyMessage.getParentMessageID(message);
      deferredRequests[parentID].notify(message);
    };

    ipyMessageHandler.handleStdinRequest = function (event) {
      var message = JSON.parse(event.data);
      var parentID = ipyMessage.getParentMessageID(message);
      deferredRequests[parentID].notify(message);
    };

    ipyMessageHandler.sendConnectRequest = function (kernelGuid) {
      var shellUrl = ipyMessageHandler.shellUrl(kernelGuid);
      var iopubUrl = ipyMessageHandler.iopubUrl(kernelGuid);
      var stdinUrl = ipyMessageHandler.stdinUrl(kernelGuid);
      ipyWebsocketHandler.registerOnMessageCallback(shellUrl, ipyMessageHandler.handleShellReply);
      ipyWebsocketHandler.registerOnMessageCallback(iopubUrl, ipyMessageHandler.handleIopubMessage);
      ipyWebsocketHandler.registerOnMessageCallback(stdinUrl, ipyMessageHandler.handleStdinRequest);
      var startMessage = JSON.stringify(ipyMessage.makeStartMessage());
      var p1 = ipyWebsocketHandler.send(shellUrl, startMessage);
      var p2 = ipyWebsocketHandler.send(iopubUrl, startMessage);
      var p3 = ipyWebsocketHandler.send(stdinUrl, startMessage);
      return $q.all([p1, p2, p3]);
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

    ipyMessage.getContent = function (message) {
      return message.content;
    };

    ipyMessage.getHeader = function(message) {
      return message.header;
    };

    ipyMessage.makeMessage = function (messageType, content, parentHeader, metadata) {
      return {
        'header': {
          'msg_id': _.uniqueId(), // uuid
          'username': ipyUsername, // str
          'session': ipySessionId, // uuid
          'msg_type': messageType, // str
          'version': '5.0'
        },
        'parent_header': _.isUndefined(parentHeader) ? {} : parentHeader, // dict
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

    ipyMessage.makeExecuteReply = function(status, executionCount, userExpressions, payload){
      var content = {
        status: status,
        execution_count: executionCount,
        user_expressions: userExpressions,
        payload: payload
      };
      return ipyMessage.makeMessage('execute_reply', content);
    };

    ipyMessage.makeExecuteResult = function(executionCount, data, metadata, parentHeader){
      var content = {
        execution_count: executionCount,
        data: data, // Format of {MIMEtype: data}
        metadata: metadata // Stores something like {'image/png': { 'width': 640, 'height': 480}}
      };
      return ipyMessage.makeMessage('execute_result', content, parentHeader);
    };

    ipyMessage.makeIopubStream = function(data, parentHeader) {
      var content = {
        data: data
      };
      return ipyMessage.makeMessage('stream', content, parentHeader);
    };

    ipyMessage.makeIopubOut = function(data, parentHeader) {
      var content = {
        data: data
      };
      return ipyMessage.makeMessage('pyout', content, parentHeader);
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

    ipyMessage.makeHistoryReply = function (history) {
      var content = {
        history: history
      };
      return ipyMessage.makeMessage('history_reply', content);
    };

    ipyMessage.makeConnectMessage = function () {
      return ipyMessage.makeMessage('connect_request');
    };

    ipyMessage.makeStartMessage = function () {
      return ipySessionId + ':';
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

    ipyMessage.makeInputMessage = function (value, parentHeader) {
      var content = {'value': value};
      return ipyMessage.makeMessage('input_reply', content, parentHeader);
    };

    return ipyMessage;
  })
  .value('ipyKernelPath', 'api/kernels/')
;