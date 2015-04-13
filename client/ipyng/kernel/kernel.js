(function(angular){
  'use strict';

  angular.module('ipyng.kernel', ['ipyng.messageHandler', 'ipyng.utils'])
    .factory('$ipyKernel', ipyKernelFactory)
    .directive('kernel', kernelDirective)
    .controller('kernelCtrl', kernelCtrl);

  function ipyKernelFactory ($ipyMessageHandler, $ipyMessage, $q, $http, _) {
    var $ipyKernel = {
      retrieveStartedKernels: retrieveStartedKernels,
      getOrCreateKernelDeferred: getOrCreateKernelDeferred,
      startKernel: startKernel,
      connectKernel: connectKernel,
      getKernel: getKernel,
      getOrStartKernel: getOrStartKernel,
      interruptKernel: interruptKernel,
      restartKernel: restartKernel,
      handleStatus: handleStatus,
      executeSilent: executeSilent,
      executeStdin: executeStdin,
      executeStdinSilent: executeStdinSilent,
      execute: execute,
      evaluate: evaluate,
      inspect: inspect,
      complete: complete,
      getHistory: getHistory,
      historySearch: historySearch,
      historyRange: historyRange,
      historyTail: historyTail
    };

    var kernelDeferreds = {};
    var kernels = {};
    var kernelGuids = {};

    $ipyKernel.kernels = kernels;
    $ipyKernel.kernelGuids = kernelGuids;

    return $ipyKernel;

    function Kernel (kernelInfo, id, kernelGuid, unregister){
      var self = this;
      _.assign(self, kernelInfo);
      self.id = id;
      self.guid = kernelGuid;
      self.unregister = unregister;
      kernels[id] = self;
      kernelGuids[self.guid] = self;
      _.forEach($ipyKernel, function(func, name){
        if(_.isFunction(func)) self[name] = _.partial(func, id);
      });
    }

    function retrieveStartedKernels () {
      return $http.get('/api/kernels/').then(
        function (response) {
          var kernels = [];
          response.data.forEach(function (kernel_data) {
            kernels.push(kernel_data.id);
          });
          return kernels;
        }
      );
    }

    function getOrCreateKernelDeferred (kernelId) {
      if(_.isUndefined(kernelDeferreds[kernelId])) {
        kernelDeferreds[kernelId] = $q.defer();
      }
      return kernelDeferreds[kernelId];
    }

    function startKernel (kernelId, kernelSpec) {
      var deferred = getOrCreateKernelDeferred(kernelId);
      return $http.post('/api/startkernel/', null)
        .catch(function(error){
          deferred.reject("Failed to start kernel: " + JSON.stringify(error));
          return $q.reject(error);
        })
        .then(function (response) {
          var kernelGuid = response.data.id;
          return $ipyKernel.connectKernel(kernelId, kernelGuid);
        });
    }

    function connectKernel (kernelId, kernelGuid) {
      var deferred = getOrCreateKernelDeferred(kernelId);
      var unregister = $ipyMessageHandler.registerChannel(kernelGuid);
      return $ipyMessageHandler.sendShellRequest(kernelGuid, $ipyMessage.makeKernelInfoMessage(), null, $ipyKernel.handleStatus)
        .catch(function(error){
          unregister();
          return $q.reject(error);
        })
        .then(function(result){
          var kernelInfo = $ipyMessage.getContent(result);
          var kernel = new Kernel(kernelInfo, kernelId, kernelGuid, unregister);
          deferred.resolve(kernel);
          return kernel;
        });
    }

    function getKernel (kernelId) {
      var deferred = getOrCreateKernelDeferred(kernelId);
      return deferred.promise;
    }

    function getOrStartKernel (kernelId, kernelSpec) {
      var deferred = kernelDeferreds[kernelId];
      if(_.isUndefined(deferred)) {
        return $ipyKernel.startKernel(kernelId, kernelSpec);
      }
      return $ipyKernel.getKernel(kernelId);
    }

    function interruptKernel (kernelId) {
      return $http.post('/api/kernels/interrupt/' + kernels[kernelId].guid, null);
    }

    function restartKernel (kernelId) {
      return $http.post('/api/kernels/restart/' + kernels[kernelId].guid, null);
    }

    function handleStatus (message) {
      if($ipyMessage.getMessageType(message) == 'status'){
        var kernel = kernelGuids[$ipyMessage.getKernelGuid(message)];
        kernel.status = $ipyMessage.getContent(message).execution_state;
      }
    }

    function executeSilent (kernelId, code, stdoutHandler) {
      return $ipyKernel.execute(kernelId, code, stdoutHandler, false, true, false);
    }

    function executeStdin (kernelId, code, stdoutHandler) {
      return $ipyKernel.execute(kernelId, code, stdoutHandler, true, false, true);
    }

    function executeStdinSilent (kernelId, code, stdoutHandler) {
      return $ipyKernel.execute(kernelId, code, stdoutHandler, false, true, true);
    }

    function execute (kernelId, code, stdoutHandler, storeHistory, silent, allowStdin) {
      storeHistory = _.isUndefined(storeHistory) ? true : storeHistory;
      silent = _.isUndefined(silent) ? false : silent;
      allowStdin = _.isUndefined(allowStdin) ? false : allowStdin;
      stdoutHandler = stdoutHandler || _.noop;
      var message = $ipyMessage.makeExecuteMessage(code, silent, storeHistory, {}, allowStdin);
      var firstDeferred = $q.defer();
      var latestDeferred = firstDeferred;
      var result = {stdout: []};
      var stdout = [];

      var iopubHandler = function(message) {
        $ipyKernel.handleStatus(message);
        var type = $ipyMessage.getMessageType(message);
        var content = $ipyMessage.getContent(message);
        if (type == 'stream' && content.name == 'stdout'){
          result.stdout.push(content.text);
          stdout.push(content.text);
          stdoutHandler(content.text);
        }
        else if (type == 'execute_result') {
          _.assign(result, content);
        }
        else if (type == 'display_data') {
          _.assign(result, content);
        }
      };

      var stdinHandler = function(message) {
        var currentDeferred = latestDeferred;
        latestDeferred = $q.defer();
        var replyDeferred = $q.defer();
        var header = $ipyMessage.getHeader(message);

        var result = {isRequest: true, stdout: stdout};
        stdout = [];
        _.assign(result, $ipyMessage.getContent(message));

        result.reply = function(inputReply) {
          var message = $ipyMessage.makeInputReply(inputReply, header);
          replyDeferred.resolve(message);
          return latestDeferred.promise;
        };

        currentDeferred.resolve(result);
        return replyDeferred.promise;
      };

      $ipyKernel.getKernel(kernelId)
        .then(function(kernel){
          return $ipyMessageHandler.sendShellRequest(kernel.guid, message, iopubHandler, stdinHandler);
        })
        .then(function (response) {
          var content = $ipyMessage.getContent(response);
          _.assign(result, content);
          if(content.status == 'error'){
            latestDeferred.reject(result);
            return;
          }
          if(result.data) result.text = result.data['text/plain'];
          result.isRequest = false;
          latestDeferred.resolve(result);
        });
      return firstDeferred.promise;
    }

    function evaluate (kernelId, expressions) {
      var isArray = _.isArray(expressions);
      if(!isArray) expressions = [expressions];
      var expressionContent = {};
      _.forEach(expressions, function(expression, index){
        expressionContent[index] = expression;
      });
      var message = $ipyMessage.makeExecuteMessage('', true, false, expressionContent, false);
      return $ipyKernel.getKernel(kernelId)
        .then(function(kernel){
          return $ipyMessageHandler.sendShellRequest(kernel.guid, message);
        })
        .then(function(response){
          var results = _.values($ipyMessage.getContent(response).user_expressions);
          _.forEach(results, function(result){
            if(result.data) result.text = result.data['text/plain'];
          });
          if(isArray) return results;
          return results[0];
        });
    }

    function inspect (kernelId, code, cursorPosition, detailLevel) {
      var message = $ipyMessage.makeInspectMessage(code, cursorPosition, detailLevel);
      return $ipyKernel.getKernel(kernelId)
        .then(function(kernel){
          return $ipyMessageHandler.sendShellRequest(kernel.guid, message);
        })
        .then(function (response) {
          return $ipyMessage.getContent(response);
        });
    }

    function complete (kernelId, code, cursorPosition) {
      var message = $ipyMessage.makeCompleteMessage(code, cursorPosition);
      return $ipyKernel.getKernel(kernelId)
        .then(function(kernel){
          return $ipyMessageHandler.sendShellRequest(kernel.guid, message);
        })
        .then(function (message) {
          return $ipyMessage.getContent(message);
        });
    }

    function getHistory (kernelId, historyMessage) {
      var hasOutput = $ipyMessage.getContent(historyMessage).output;
      return $ipyKernel.getKernel(kernelId)
        .then(function(kernel){
          return $ipyMessageHandler.sendShellRequest(kernel.guid, historyMessage);
        })
        .then(function (message) {
          var content = $ipyMessage.getContent(message);
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
    }

    function historySearch (kernelId, pattern, numResults, getUnique, getOutput, getRaw) {
      getOutput = _.isUndefined(getOutput) ? true : getOutput;
      getRaw = _.isUndefined(getRaw) ? true : getRaw;
      getUnique = _.isUndefined(getUnique) ? false : getUnique;
      var message = $ipyMessage.makeHistoryMessage(getOutput, getRaw, 'search', null, null,
        numResults, pattern, getUnique);
      return $ipyKernel.getHistory(kernelId, message);
    }

    function historyRange (kernelId, start, stop, getOutput, getRaw) {
      var message = $ipyMessage.makeHistoryMessage(getOutput, getRaw, 'range', start, stop);
      return $ipyKernel.getHistory(kernelId, message);
    }

    function historyTail (kernelId, numResults, getOutput, getRaw) {
      getOutput = _.isUndefined(getOutput) ? true : getOutput;
      getRaw = _.isUndefined(getRaw) ? true : getRaw;
      var message = $ipyMessage.makeHistoryMessage(getOutput, getRaw, 'tail', null, null, numResults);
      return $ipyKernel.getHistory(kernelId, message);
    }
  }

  function kernelDirective () {
    return {
      restrict: 'A',
      controller: 'kernelCtrl'
    };
  }

  function kernelCtrl ($attrs, $ipyKernel, _) {
    var self = this;
    if($attrs.kernel) self.id = $attrs.kernel;
    else self.id = _.uniqueId();
    var kernel;
    if($attrs.$attr.start) {
      kernel = $ipyKernel.startKernel(self.id, $attrs.start);
    }
    else {
      kernel = $ipyKernel.getKernel(self.id);
    }

    self.promise = kernel.then(function(kernel){
      _.assign(self, kernel);
      return self;
    });
  }

})(angular);