angular.module('ipyng.kernel', ['ipyng.messageHandler', 'ipyng.utils']).
  factory('ipyKernel', function (ipyMessageHandler, ipyMessage, $q, $http, _) {
    var ipyKernel = {};
    var kernelDeferreds = {};
    var kernels = {};
    var kernelGuids = {};

    ipyKernel.kernels = kernels;
    ipyKernel.kernelGuids = kernelGuids;

    var Kernel = function(kernelInfo, id, kernelGuid, unregister){
      _.assign(this, kernelInfo);
      this.id = id;
      this.guid = kernelGuid;
      this.unregister = unregister;
      kernels[id] = this;
      kernelGuids[this.guid] = this;
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
      return ipyMessageHandler.sendShellRequest(kernelGuid, ipyMessage.makeKernelInfoMessage(), null, ipyKernel.handleStatus)
        .catch(function(error){
          unregister();
          return $q.reject(error);
        })
        .then(function(result){
          var kernelInfo = ipyMessage.getContent(result);
          var kernel = new Kernel(kernelInfo, kernelId, kernelGuid, unregister);
          deferred.resolve(kernel);
          return kernel;
        });
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

    ipyKernel.handleStatus = function(message) {
      if(ipyMessage.getMessageType(message) == 'status'){
        var kernel = kernelGuids[ipyMessage.getKernelGuid(message)];
        kernel.status = ipyMessage.getContent(message).execution_state;
      }
    };

    ipyKernel.executeSilent = function(kernelId, code, stdoutHandler) {
      return ipyKernel.execute(kernelId, code, stdoutHandler, false, true, false);
    };

    ipyKernel.executeStdin = function(kernelId, code, stdoutHandler) {
      return ipyKernel.execute(kernelId, code, stdoutHandler, true, false, true);
    };

    ipyKernel.executeStdinSilent = function(kernelId, code, stdoutHandler) {
      return ipyKernel.execute(kernelId, code, stdoutHandler, false, true, true);
    };

    ipyKernel.execute = function (kernelId, code, stdoutHandler, storeHistory, silent, allowStdin) {
      storeHistory = _.isUndefined(storeHistory) ? true : storeHistory;
      silent = _.isUndefined(silent) ? false : silent;
      allowStdin = _.isUndefined(allowStdin) ? false : allowStdin;
      stdoutHandler = stdoutHandler || _.noop;
      var message = ipyMessage.makeExecuteMessage(code, silent, storeHistory, {}, allowStdin);
      var firstDeferred = $q.defer();
      var latestDeferred = firstDeferred;
      var result = {stdout: []};
      var stdout = [];

      var iopubHandler = function(message) {
        ipyKernel.handleStatus(message);
        var type = ipyMessage.getMessageType(message);
        var content = ipyMessage.getContent(message);
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
        var header = ipyMessage.getHeader(message);

        var result = {isRequest: true, stdout: stdout};
        stdout = [];
        _.assign(result, ipyMessage.getContent(message));

        result.reply = function(inputReply) {
          var message = ipyMessage.makeInputReply(inputReply, header);
          replyDeferred.resolve(message);
          return latestDeferred.promise;
        };

        currentDeferred.resolve(result);
        return replyDeferred.promise;
      };

      ipyKernel.getKernel(kernelId)
        .then(function(kernel){
          return ipyMessageHandler.sendShellRequest(kernel.guid, message, iopubHandler, stdinHandler);
        })
        .then(function (response) {
          var content = ipyMessage.getContent(response);
          if(content.status == 'error'){
            _.assign(result, content);
            latestDeferred.reject(result);
            return;
          }
          if(result.data) result.text = result.data['text/plain'];
          result.isRequest = false;
          latestDeferred.resolve(result);
        });
      return firstDeferred.promise;
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
          return ipyMessageHandler.sendShellRequest(kernel.guid, message);
        })
        .then(function(response){
          var results = _.values(ipyMessage.getContent(response).user_expressions);
          _.forEach(results, function(result){
            if(result.data) result.text = result.data['text/plain'];
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
          return ipyMessageHandler.sendShellRequest(kernel.guid, message);
        })
        .then(function (message) {
          return ipyMessage.getContent(message);
        });
    };

    ipyKernel.getHistory = function (kernelId, historyMessage) {
      var hasOutput = ipyMessage.getContent(historyMessage).output;
      return ipyKernel.getKernel(kernelId)
        .then(function(kernel){
          return ipyMessageHandler.sendShellRequest(kernel.guid, historyMessage);
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
        if($attrs.kernel) this.id = $attrs.kernel;
        else this.id = _.uniqueId();
        var kernel;
        if($attrs.$attr.start) {
          kernel = ipyKernel.startKernel(this.id, $attrs.start);
        }
        else {
          kernel = ipyKernel.getKernel(this.id);
        }
        var _this = this;
        this.promise = kernel.then(function(kernel){
          _.assign(_this, kernel);
          return _this;
        });

        var makeKernelFunction = function(func, id) {
          return function() {
            var args = [id];
            Array.prototype.push.apply(args, arguments);
            return func.apply(this, args);
          };
        };

        this.interruptKernel = makeKernelFunction(ipyKernel.interruptKernel, this.id);
        this.restartKernel = makeKernelFunction(ipyKernel.restartKernel, this.id);
        this.execute = makeKernelFunction(ipyKernel.execute, this.id);
        this.executeSilent = makeKernelFunction(ipyKernel.executeSilent, this.id);
        this.executeStdin = makeKernelFunction(ipyKernel.executeStdin, this.id);
        this.executeStdinSilent = makeKernelFunction(ipyKernel.executeStdinSilent, this.id);
        this.evaluate = makeKernelFunction(ipyKernel.evaluate, this.id);
        this.inspect = makeKernelFunction(ipyKernel.inspect, this.id);
        this.complete = makeKernelFunction(ipyKernel.complete, this.id);
        this.historySearch = makeKernelFunction(ipyKernel.historySearch, this.id);
        this.historyRange = makeKernelFunction(ipyKernel.historyRange, this.id);
        this.historyTail = makeKernelFunction(ipyKernel.historyTail, this.id);
      }
    };
  })
;