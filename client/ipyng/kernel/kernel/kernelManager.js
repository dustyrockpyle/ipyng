angular.module('ipyng.kernel.kernelManager', ['ipyng.kernel.messageHandler', 'ipyng.kernel.watch', 'ipyng.utils']).
  factory('ipyKernel', function (ipyMessageHandler, ipyMessage, ipyWatch, $q, $http, _) {
    var ipyKernel = {};
    var kernelDeferreds = {};
    var kernels = {};

    ipyKernel.kernels = kernels;

    ipyKernel.retrieveStartedKernels = function () {
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

    var getOrCreateKernelDeferred = function(kernelId) {
      if(_.isUndefined(kernelDeferreds[kernelId])) {
        kernelDeferreds[kernelId] = $q.defer();
      }
      return kernelDeferreds[kernelId];
    };

    ipyKernel.startKernel = function (kernelId, kernelSpec) {
      var deferred = getOrCreateKernelDeferred(kernelId);
      return $http.post('/api/startkernel/', null)
        .catch(function(error){
          deferred.reject("Failed to start kernel: " + JSON.stringify(error));
          return $q.reject(error);
        })
        .then(function (response) {
          var kernelGuid = response.data.id;
          return ipyKernel.connectKernel(kernelId, kernelGuid);
        });
    };

    ipyKernel.connectKernel = function(kernelId, kernelGuid) {
      var deferred = getOrCreateKernelDeferred(kernelId);
      var unregister = ipyMessageHandler.registerChannel(kernelGuid);
      return ipyMessageHandler.sendShellRequest(kernelGuid, ipyMessage.makeKernelInfoMessage())
        .catch(function(error){
          unregister();
          return $q.reject(error);
        })
        .then(function(result){
          var kernelInfo = ipyMessage.getContent(result);
          var kernel = new Kernel(kernelInfo, kernelId, kernelGuid, unregister);
          deferred.resolve(kernel);
          return kernel;
        }, null, handleNotify(kernelId));
    };

    ipyKernel.getKernel = function(kernelId) {
      var deferred = getOrCreateKernelDeferred(kernelId);
      return deferred.promise;
    };

    ipyKernel.getOrStartKernel = function(kernelId, kernelSpec) {
      var deferred = kernelDeferreds[kernelId];
      if(_.isUndefined(deferred)) {
        return ipyKernel.startKernel(kernelId, kernelSpec);
      }
      return ipyKernel.getKernel(kernelId);
    };


    ipyKernel.interruptKernel = function (kernelId) {
      return $http.post('/api/kernels/interrupt/' + kernels[kernelId].guid, null);
    };

    ipyKernel.restartKernel = function (kernelId) {
      return $http.post('/api/kernels/restart/' + kernels[kernelId].guid, null);
    };

    var handleNotify = function(kernelId, callback) {
      return function(message){
        return ipyKernel.getKernel(kernelId)
          .then(function(kernel){
            if(ipyMessage.getMessageType(message) == "status"){
              kernel.status = ipyMessage.getContent(message).execution_state;
            }
            if(!_.isUndefined(callback)) callback(message);
          });
      };
    };

    ipyKernel.execute = function (kernelId, code, enableWatches, storeHistory, silent, allowStdin) {
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
      var result = {stdout: []};
      ipyMessageHandler.sendShellRequest(kernels[kernelId].guid, message)
        .then(function (response) {
          var content = ipyMessage.getContent(response);
          _.forEach(ipyWatch.getWatchedExpressions(kernelId), function (expression) {
            ipyWatch.setValue(kernelId, expression, content.user_expressions[expression]);
          });
          result.text = result['text/plain'];
          deferred.resolve(result);
        }, null, handleNotify(kernelId, function(message){
          var msg_type = ipyMessage.getMessageType(message);
          var content = ipyMessage.getContent(message);
          if (msg_type == 'stream' && content.name == 'stdout'){
            result.stdout.push(content.text);
            deferred.notify(content.text);
          }
          else if (msg_type == 'execute_result') {
            _.assign(result, content);
            _.assign(result, content.data);
          }
          else if (msg_type == 'display_data') {
            _.assign(result, content);
            _.assign(result, content.data);
          }
        }));
      return deferred.promise;
    };

    ipyKernel.evaluate = function (kernelId, expressions) {
      var isArray = _.isArray(expressions);
      if(!isArray) expressions = [expressions];
      var expressionContent = {};
      _.forEach(expressions, function(expression, index){
        expressionContent[index] = expression;
      });
      var message = ipyMessage.makeExecuteMessage('', true, false, expressionContent, false);
      return ipyMessageHandler.sendShellRequest(kernels[kernelId].guid, message)
        .then(function(response){
          var result = _.values(ipyMessage.getContent(response).user_expressions);
          if(isArray) return result;
          return result[0];
        });
    };

    ipyKernel.inspect = function (kernelId, code, cursorPosition, detailLevel) {
      var message = ipyMessage.makeInspectMessage(code, cursorPosition, detailLevel);
      return ipyMessageHandler.sendShellRequest(kernels[kernelId].guid, message)
        .then(function (response) {
          return ipyMessage.getContent(response);
        });
    };

    ipyKernel.complete = function (kernelId, code, cursorPosition) {
      var message = ipyMessage.makeCompleteMessage(code, cursorPosition);
      return ipyMessageHandler.sendShellRequest(kernels[kernelId].guid, message)
        .then(function (message) {
          return ipyMessage.getContent(message);
        });
    };

    ipyKernel.getHistory = function (kernelId, historyMessage) {
      var hasOutput = ipyMessage.getContent(historyMessage).output;
      return ipyMessageHandler.sendShellRequest(kernels[kernelId].guid, historyMessage)
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

    ipyKernel.historySearch = function (kernelId, pattern, numResults, getUnique, getOutput, getRaw) {
      getOutput = _.isUndefined(getOutput) ? true : getOutput;
      getRaw = _.isUndefined(getRaw) ? true : getRaw;
      getUnique = _.isUndefined(getUnique) ? false : getUnique;
      var message = ipyMessage.makeHistoryMessage(getOutput, getRaw, 'search', null, null,
        numResults, pattern, getUnique);
      return ipyKernel.getHistory(kernelId, message);
    };

    ipyKernel.historyRange = function (kernelId, start, stop, getOutput, getRaw) {
      var message = ipyMessage.makeHistoryMessage(getOutput, getRaw, 'range', start, stop);
      return ipyKernel.getHistory(kernelId, message);
    };

    ipyKernel.historyTail = function (kernelId, numResults, getOutput, getRaw) {
      getOutput = _.isUndefined(getOutput) ? true : getOutput;
      getRaw = _.isUndefined(getRaw) ? true : getRaw;
      var message = ipyMessage.makeHistoryMessage(getOutput, getRaw, 'tail', null, null, numResults);
      return ipyKernel.getHistory(kernelId, message);
    };

    var Kernel = function(kernelInfo, id, kernelGuid, unregister){
      _.assign(this, kernelInfo);
      this.id = id;
      this.guid = kernelGuid;
      this.unregister = unregister;
      kernels[id] = this;
    };

    var makeKernelFunction = function(func){
      return function() {
        var args = _.concat(this.id, arguments);
        return func.apply(this, args);
      }
    };

    Kernel.prototype = {
      interruptKernel: makeKernelFunction(ipyKernel.interruptKernel),
      restartKernel: makeKernelFunction(ipyKernel.restartKernel),
      execute: makeKernelFunction(ipyKernel.execute),
      evaluate: makeKernelFunction(ipyKernel.evaluate),
      inspect: makeKernelFunction(ipyKernel.inspect),
      complete: makeKernelFunction(ipyKernel.complete),
      historySearch: makeKernelFunction(ipyKernel.historySearch),
      historyRange: makeKernelFunction(ipyKernel.historyRange),
      historyTail: makeKernelFunction(ipyKernel.historyTail)
    };

    return ipyKernel;
  })
;