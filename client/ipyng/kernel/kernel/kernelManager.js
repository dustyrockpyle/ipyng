angular.module('ipyng.kernel.kernelManager', ['ipyng.kernel.messageHandler', 'ipyng.kernel.watch', 'ipyng.utils']).
  factory('ipyKernel', function (ipyMessageHandler, ipyMessage, ipyWatch, $q, $http, _) {
    var kernel = {};
    kernel.kernelGuids = {};

    kernel.kernelStatus = {};

    kernel.retrieveStartedKernels = function () {
      return $http.get('/api/kernels/').then(
        function (response) {
          var kernels = [];
          response.data.forEach(function (kernel_data) {
            kernels.push(kernel_data.id);
          });
          return kernels;
        }
      );
    };

    var startKernel = function (kernelId) {
      kernel.kernelGuids[kernelId] =
        $http.post('/api/startkernel/', null)
          .then(function (response) {
            return kernel.connectKernel(kernelId, response.data.id);
          });
      return kernel.kernelGuids[kernelId];
    };

    kernel.getOrStartKernel = function(kernelId) {
      if(_.has(kernel.kernelGuids, kernelId)) return kernel.kernelGuids[kernelId];
      return startKernel(kernelId);
    };

    kernel.connectKernel = function(kernelId, kernelGuid) {
      kernel.kernelGuids[kernelId] =
        ipyMessageHandler.sendConnectRequest(kernelGuid)
          .then(function(){
            return kernelGuid;
          });
      return kernel.kernelGuids[kernelId];
    };

    kernel.interruptKernel = function (kernelId) {
      return kernel.kernelGuids[kernelId]
        .then(function(kernelGuid){
          return $http.post('/api/kernels/interrupt/' + kernelGuid, null);
        });
    };

    kernel.restartKernel = function (kernelId) {
      return kernel.kernelGuids[kernelId]
        .then(function(kernelGuid){
          return $http.post('/api/kernels/restart/' + kernelGuid, null);
        });
    };

    var handleNotify = function(kernelId, callback) {
      return function(message){
        if(ipyMessage.getMessageType(message) == "status"){
          kernel.kernelStatus[kernelId] = ipyMessage.getContent(message).execution_state;
        }
        if(!_.isUndefined(callback)) callback(message);
      };
    };

    kernel.execute = function (kernelId, code, enableWatches, storeHistory, silent, allowStdin) {
      enableWatches = _.isUndefined(enableWatches) ? true : enableWatches;
      storeHistory = _.isUndefined(storeHistory) ? true : storeHistory;
      silent = _.isUndefined(silent) ? false : silent;
      allowStdin = _.isUndefined(allowStdin) ? false : allowStdin;
      var expressions = {};
      if (enableWatches) {
        ipyWatch.getWatchedExpressions(kernelId).forEach(function (expression) {
          expressions[expression] = expression;
        });
      }
      var message = ipyMessage.makeExecuteMessage(code, silent, storeHistory, expressions, allowStdin);
      var deferred = $q.defer();
      kernel.getOrStartKernel(kernelId)
        .then(function(kernelGuid){
          return ipyMessageHandler.sendShellRequest(kernelGuid, message);
        })
        .then(function (response) {
          var content = ipyMessage.getContent(response);
          _.forEach(ipyWatch.getWatchedExpressions(kernelId), function (expression) {
            ipyWatch.setValue(kernelId, expression, content.user_expressions[expression]);
          });
          return response;
        }, null, handleNotify(kernelId, function(message){
          var msg_type = ipyMessage.getMessageType(message);
          var content = ipyMessage.getContent(message);
          if (msg_type == "stream"){
            deferred.notify(content.data);
          }
          else if (msg_type == "pyout") {
            content.text = content.data['text/plain'];
            deferred.resolve(content);
          }
        }));
      return deferred.promise;
    };

    kernel.evaluate = function (kernelId, expression) {
      return kernel.execute(kernelId, expression, false, false, true, false);
    };

    kernel.inspect = function (kernelId, code, cursorPosition, detailLevel) {
      var message = ipyMessage.makeInspectMessage(code, cursorPosition, detailLevel);
      return kernel.getOrStartKernel(kernelId)
        .then(function(kernelGuid){
          return ipyMessageHandler.sendShellRequest(kernelGuid, message);
        })
        .then(function (response) {
          return ipyMessage.getContent(response);
        });
    };

    kernel.complete = function (kernelId, code, cursorPosition) {
      var message = ipyMessage.makeCompleteMessage(code, cursorPosition);
      return kernel.getOrStartKernel(kernelId)
        .then(function(kernelGuid){
          ipyMessageHandler.sendShellRequest(kernelGuid, message);
        })
        .then(function (message) {
          return ipyMessage.getContent(message);
        });
    };

    kernel.getHistory = function (kernelId, historyMessage) {
      var hasOutput = ipyMessage.getContent(historyMessage).output;
      return kernel.getOrStartKernel(kernelId)
        .then(function(kernelGuid){
          return ipyMessageHandler.sendShellRequest(kernelGuid, historyMessage);
        })
        .then(function (message) {
          var content = ipyMessage.getContent(message);
          var history = [];
          var newHistoryLine;
          content.history.forEach(function (historyLine) {
            newHistoryLine = {};
            newHistoryLine.session = historyLine[0];
            newHistoryLine.lineNumber = historyLine[1];
            if (hasOutput) {
              newHistoryLine.input = historyLine[2][0];
              newHistoryLine.output = historyLine[2][1];
            } else {
              newHistoryLine.input = historyLine[2];
            }
            history.push(newHistoryLine);
          });
          return history;
        });
    };

    kernel.historySearch = function (kernelId, pattern, numResults, getUnique, getOutput, getRaw) {
      getOutput = _.isUndefined(getOutput) ? true : getOutput;
      getRaw = _.isUndefined(getRaw) ? true : getRaw;
      getUnique = _.isUndefined(getUnique) ? false : getUnique;
      var message = ipyMessage.makeHistoryMessage(getOutput, getRaw, 'search', null, null,
        numResults, pattern, getUnique);
      return kernel.getHistory(kernelId, message);
    };

    kernel.historyRange = function (kernelId, start, stop, getOutput, getRaw) {
      var message = ipyMessage.makeHistoryMessage(getOutput, getRaw, 'range', start, stop);
      return kernel.getHistory(kernelId, message);
    };

    kernel.historyTail = function (kernelId, numResults, getOutput, getRaw) {
      getOutput = _.isUndefined(getOutput) ? true : getOutput;
      getRaw = _.isUndefined(getRaw) ? true : getRaw;
      var message = ipyMessage.makeHistoryMessage(getOutput, getRaw, 'tail', null, null, numResults);
      return kernel.getHistory(kernelId, message);
    };

    return kernel;
  })
;