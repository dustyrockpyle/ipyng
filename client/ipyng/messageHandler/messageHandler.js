(function(angular){
  'use strict';

  angular.module('ipyng.messageHandler', ['ipyng.messageHandler.websocket', 'ipyng.utils', 'ng.lodash'])
    .factory('ipySessionId', function(_){
      return _.uniqueId();
    })
    .factory('ipyUsername', function(){
      return '';
    })
    .value('ipyKernelPath', 'api/kernels/')
    .factory('$ipyMessageHandler', ipyMessageHandlerFactory)
    .factory('$ipyMessage', ipyMessageFactory);

  function ipyMessageHandlerFactory ($ipyWebsocketHandler, $ipyMessage, ipyKernelPath, $ipyUtils,
                               ipySessionId, $location, $q, _, $timeout, $rootScope) {
    var $ipyMessageHandler = {
      channelUrl: channelUrl,
      httpUrl: httpUrl,
      sendShellRequest: sendShellRequest,
      handleShellReply: handleShellReply,
      handleIopubMessage: handleIopubMessage,
      handleStdinRequest: handleStdinRequest,
      handleChannelReply: handleChannelReply,
      registerChannel: registerChannel
    };

    var shellHandlers = {};
    var kernelGuids = {};

    return $ipyMessageHandler;

    function channelUrl (kernelGuid) {
      return $ipyUtils.url_path_join("ws://" + $location.host() + ":" + $location.port(), ipyKernelPath, kernelGuid,
        'channels?session_id=' + ipySessionId);
    }

    function httpUrl (kernelGuid, endpoint) {
      return $ipyUtils.url_path_join("http://" + $location.host() + ":" + $location.port(), ipyKernelPath, kernelGuid, endpoint);
    }

    function ShellHandler (message, iopubHandler, stdinHandler) {
      this.msgId = $ipyMessage.getMessageId(message);
      shellHandlers[this.msgId] = this;
      this.reply = $q.defer();
      this.idle = $q.defer();
      this.iopubHandler = iopubHandler || _.noop;
      this.stdinHandler = stdinHandler; // Dunno what to do if this is empty and stdin is required. Guess we'll hang.
    }

    function sendShellRequest (kernelGuid, message, stdinHandler, stdoutHandler) {
      var msgId = $ipyMessage.getHeader(message);
      var handler = new ShellHandler(message, stdinHandler, stdoutHandler);
      msgId = $ipyMessage.getMessageId(message);

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
      $ipyWebsocketHandler.send($ipyMessageHandler.channelUrl(kernelGuid), $ipyMessage.stringifyMessage(message));
      return handler.reply.promise;
    }

    function handleShellReply (message) {
      var parentId = $ipyMessage.getParentMessageId(message);
      shellHandlers[parentId].idle.promise
        .then(function(result){
          shellHandlers[parentId].reply.resolve(message);
        });
    }

    function handleIopubMessage (message) {
      var parentId = $ipyMessage.getParentMessageId(message);
      $rootScope.$apply(function(){
        shellHandlers[parentId].iopubHandler(message);
      });
      if($ipyMessage.getMessageType(message) == 'status' && $ipyMessage.getContent(message).execution_state == 'idle' ) {
        shellHandlers[parentId].idle.resolve();
      }
    }

    function handleStdinRequest (message) {
      var parentId = $ipyMessage.getParentMessageId(message);
      var guid = $ipyMessage.getKernelGuid(message);
      $q.when(shellHandlers[parentId].stdinHandler(message))
        .then(function(response){
          $ipyWebsocketHandler.send($ipyMessageHandler.channelUrl(guid), $ipyMessage.stringifyMessage(response));
        });
    }

    function handleChannelReply (event, url) {
      var message = $ipyMessage.parseMessage(event.data, kernelGuids[url]);
      if(message.channel == 'shell') $ipyMessageHandler.handleShellReply(message);
      else if (message.channel == 'iopub') $ipyMessageHandler.handleIopubMessage(message);
      else if (message.channel == 'stdin') $ipyMessageHandler.handleStdinRequest(message);
      else throw "Unknown channel";
    }

    function registerChannel (kernelGuid) {
      var url = $ipyMessageHandler.channelUrl(kernelGuid);
      kernelGuids[url] = kernelGuid;
      return $ipyWebsocketHandler.registerOnMessageCallback(url, $ipyMessageHandler.handleChannelReply);
    }
  }

  function ipyMessageFactory (_, ipySessionId, ipyUsername) {
    var $ipyMessage = {
      getMessageId: getMessageId,
      getParentMessageId: getParentMessageId,
      getMessageType: getMessageType,
      getSession: getSession,
      getContent: getContent,
      getHeader: getHeader,
      getParentHeader: getParentHeader,
      parseMessage: parseMessage,
      getKernelGuid: getKernelGuid,
      makeMessage: makeMessage,
      makeExecuteMessage: makeExecuteMessage,
      makeExecuteReply: makeExecuteReply,
      makeExecuteResult: makeExecuteResult,
      makeIopubStream: makeIopubStream,
      makeIopubDisplay: makeIopubDisplay,
      makeInspectMessage: makeInspectMessage,
      makeInspectReply: makeInspectReply,
      makeCompleteMessage: makeCompleteMessage,
      makeHistoryMessage: makeHistoryMessage,
      makeHistoryReply: makeHistoryReply,
      makeKernelInfoMessage: makeKernelInfoMessage,
      makeKernelShutdownMessage: makeKernelShutdownMessage,
      makeStreamMessage: makeStreamMessage,
      makeStatusReply: makeStatusReply,
      makeInputRequest: makeInputRequest,
      makeInputReply: makeInputReply,
      stringifyMessage: stringifyMessage
    };

    return $ipyMessage;

    function getMessageId (message) {
      return message.header.msg_id;
    }

    function getParentMessageId (message) {
      return message.parent_header.msg_id;
    }

    function getMessageType (message) {
      return message.header.msg_type;
    }

    function getSession (message) {
      return message.header.session;
    }

    function getContent (message) {
      return message.content;
    }

    function getHeader (message) {
      return message.header;
    }

    function getParentHeader (message) {
      return message.parent_header;
    }

    function parseMessage (data, kernelGuid) {
      var message = JSON.parse(data);
      message.kernel_guid = kernelGuid;
      return message;
    }

    function getKernelGuid (message) {
      return message.kernel_guid;
    }

    function makeMessage (messageType, content, parentHeader, channel, metadata) {
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
    }

    function makeExecuteMessage (code, silent, storeHistory, userExpressions, allowStdin) {
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
      return $ipyMessage.makeMessage('execute_request', content);
    }

    function makeExecuteReply (status, executionCount, userExpressions, payload, parentHeader, traceback){
      var content = {
        status: status,
        execution_count: executionCount,
        user_expressions: userExpressions,
        payload: payload
      };
      if(traceback) content.traceback = traceback;
      return $ipyMessage.makeMessage('execute_reply', content, parentHeader);
    }

    function makeExecuteResult (data, executionCount, metadata, parentHeader){
      var content = {
        data: data, // Format of {MIMEtype: data}
        execution_count: executionCount,
        metadata: metadata // Stores something like {'image/png': { 'width': 640, 'height': 480}}
      };
      return $ipyMessage.makeMessage('execute_result', content, parentHeader, 'iopub');
    }

    function makeIopubStream (text, parentHeader) {
      var content = {
        text: text,
        name: 'stdout'
      };
      return $ipyMessage.makeMessage('stream', content, parentHeader);
    }

    function makeIopubDisplay (data, parentHeader) {
      var content = {
        data: data
      };
      return $ipyMessage.makeMessage('display_data', content, parentHeader);
    }

    function makeInspectMessage (code, cursorPosition, detailLevel) {
      detailLevel = _.isUndefined(detailLevel) ? 0 : detailLevel;
      var content = {
        'code': code,
        'cursor_pos': cursorPosition,
        'detail_level': detailLevel
      };
      return $ipyMessage.makeMessage('inspect_request', content);
    }

    function makeInspectReply (status, data, metadata, parentHeader) {
      var content = {
        status: status,
        data: data,
        metadata: metadata
      };
      return $ipyMessage.makeMessage('inspect_reply', content, parentHeader);
    }

    function makeCompleteMessage (code, cursorPosition) {
      var content = {
        'code': code,
        'cursor_pos': cursorPosition
      };
      return $ipyMessage.makeMessage('complete_request', content);
    }

    function makeHistoryMessage (output, raw, historyAccessType, start, stop, lastN, pattern, unique) {
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
      return $ipyMessage.makeMessage('history_request', content);
    }

    function makeHistoryReply (history, parentHeader) {
      var content = {
        history: history
      };
      return $ipyMessage.makeMessage('history_reply', content, parentHeader);
    }

    function makeKernelInfoMessage () {
      return $ipyMessage.makeMessage('kernel_info_request');
    }

    function makeKernelShutdownMessage (restart) {
      var content = {'restart': restart};
      return $ipyMessage.makeMessage('shutdown_request', content);
    }

    function makeStreamMessage (name, data) {
      var content = {
        'name': name,
        'data': data
      };
      return $ipyMessage.makeMessage('stream', content);
    }

    function makeStatusReply (status, parentHeader) {
      var content = {execution_state: status};
      return $ipyMessage.makeMessage('status', content, parentHeader, 'iopub');
    }

    function makeInputRequest(prompt, password, parentHeader) {
      var content = {prompt: prompt, password: password};
      return $ipyMessage.makeMessage('input_request', content, parentHeader, 'stdin');
    }

    function makeInputReply (value, parentHeader) {
      var content = {'value': value};
      return $ipyMessage.makeMessage('input_reply', content, parentHeader, 'stdin');
    }

    function stringifyMessage (message) {
      return JSON.stringify(message);
    }
  }
})(angular);