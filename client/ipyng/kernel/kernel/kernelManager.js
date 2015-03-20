angular.module('ipyng.kernel.kernelManager', ['ipyng.kernel.messageHandler', 'ipyng.kernel.watch', 'ipyng.utils']).
  factory('ipyKernel', function (ipyMessageHandler, ipyMessage, ipyWatch, $q, $http, _) {
    var ipyKernel = {};
    var kernelDeferreds = {};
    var kernels = {};
    ipyKernel.kernels = kernels;

    var Kernel = function(kernelInfo, id, kernelGuid, unregister){
      _.assign(this, kernelInfo);
      this.id = id;
      this.guid = kernelGuid;
      this.unregister = unregister;
      kernels[id] = this;
    };

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
      ipyKernel.getKernel(kernelId)
        .then(function(kernel){
          return ipyMessageHandler.sendShellRequest(kernel.guid, message);
        })
        .then(function (response) {
          var content = ipyMessage.getContent(response);
          _.forEach(ipyWatch.getWatchedExpressions(kernelId), function (expression) {
            var expressionResult = content.user_expressions[expression];
            expressionResult.text = expressionResult.data['text/plain'];
            ipyWatch.setValue(kernelId, expression, expressionResult);
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
      return ipyKernel.getKernel(kernelId)
        .then(function(kernel){
          return ipyMessageHandler.sendShellRequest(kernel.guid, message)
        })
        .then(function(response){
          var results = _.values(ipyMessage.getContent(response).user_expressions);
          _.forEach(results, function(result){
            result.text = result.data['text/plain'];
          });
          if(isArray) return results;
          return results[0];
        });
    };

    ipyKernel.inspect = function (kernelId, code, cursorPosition, detailLevel) {
      var message = ipyMessage.makeInspectMessage(code, cursorPosition, detailLevel);
      return ipyKernel.getKernel(kernelId)
        .then(function(kernel){
          return ipyMessageHandler.sendShellRequest(kernel.guid, message);
        })
        .then(function (response) {
          return ipyMessage.getContent(response);
        });
    };

    ipyKernel.complete = function (kernelId, code, cursorPosition) {
      var message = ipyMessage.makeCompleteMessage(code, cursorPosition);
      return ipyKernel.getKernel(kernelId)
        .then(function(kernel){
          return ipyMessageHandler.sendShellRequest(kernel.guid, message)
        })
        .then(function (message) {
          return ipyMessage.getContent(message);
        });
    };

    ipyKernel.getHistory = function (kernelId, historyMessage) {
      var hasOutput = ipyMessage.getContent(historyMessage).output;
      return ipyKernel.getKernel(kernelId)
        .then(function(kernel){
          return ipyMessageHandler.sendShellRequest(kernel.guid, historyMessage)
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

    return ipyKernel;
  })
  .directive('kernel', function(){
    return {
      restrict: 'A',
      controller: function ($scope, $attrs, ipyKernel, _) {
        if($attrs.kernel) this.kernelId = $attrs.kernel;
        else this.kernelId = _.uniqueId();
        if($attrs.$attr.start) {
          this.promise = ipyKernel.startKernel(this.kernelId, $attrs.start);
        }
        else {
          this.promise = ipyKernel.getKernel(this.kernelId);
        }

        var makeKernelFunction = function(func, id) {
          return function() {
            var args = [id];
            Array.prototype.push.apply(args, arguments);
            return func.apply(this, args);
          };
        };

        this.interruptKernel = makeKernelFunction(ipyKernel.interruptKernel, this.kernelId);
        this.restartKernel = makeKernelFunction(ipyKernel.restartKernel, this.kernelId);
        this.execute = makeKernelFunction(ipyKernel.execute, this.kernelId);
        this.evaluate = makeKernelFunction(ipyKernel.evaluate, this.kernelId);
        this.inspect = makeKernelFunction(ipyKernel.inspect, this.kernelId);
        this.complete = makeKernelFunction(ipyKernel.complete, this.kernelId);
        this.historySearch = makeKernelFunction(ipyKernel.historySearch, this.kernelId);
        this.historyRange = makeKernelFunction(ipyKernel.historyRange, this.kernelId);
        this.historyTail = makeKernelFunction(ipyKernel.historyTail, this.kernelId);
      }
    };
  });
;