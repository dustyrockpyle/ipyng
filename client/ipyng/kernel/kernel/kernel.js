angular.module('ipyng.kernel.kernel', ['ipyng.messageHandler', 'ipyng.utils']).
  factory('ipyKernel', ['ipyMessageHandler', 'ipyMessage', 'ipyWatch', '$q', '$http', '_',
    function (ipyMessageHandler, ipyMessage, ipyWatch, $q, $http, _) {
      var kernel = {};
      kernel.kernels = [];

      kernel.retrieveStartedKernels = function () {
        return $http.get('/api/kernels/').then(
          function (response) {
            response.data.forEach(function (kernel_data) {
              kernel.kernels.push(kernel_data.id);
            });
          }
        );
      };
      kernel.retrieveStartedKernels();

      kernel.startKernel = function (kernelID, registryID) {
        if (_.contains(kernel.kernels, kernelID)) {
          return $q.reject("KernelID already registered.");
        }

        return $http.post('/api/startkernel/' + kernelID, null).then(
          function (response) {
            kernel.kernels.push(kernelID);
            return true;
          }
        );
      };

      kernel.interruptKernel = function (kernelID) {
        return $http.post('/api/kernels/interrupt/' + kernelID, null).then(
          function (response) {
            return true;
          }
        );
      };

      kernel.restartKernel = function (kernelID) {
        return $http.post('/api/kernels/restart/' + kernelID, null).then(
          function (response) {
            return true;
          }
        );
      };

      kernel.execute = function (kernelID, code, enableWatches, storeHistory, silent, allowStdin) {
        enableWatches = _.isUndefined(enableWatches) ? true : enableWatches;
        storeHistory = _.isUndefined(storeHistory) ? true : storeHistory;
        silent = _.isUndefined(silent) ? false : silent;
        allowStdin = _.isUndefined(allowStdin) ? false : allowStdin;
        var expressions = {};
        if (enableWatches) {
          ipyWatch.getWatchedExpressions(kernelID).forEach(function (expression) {
            expressions[expression] = expression;
          });
        }
        var message = ipyMessage.makeExecuteMessage(code, silent, storeHistory, expressions, allowStdin);
        var deferred = $q.defer();
        ipyMessageHandler.sendShellRequest(kernelID, message).then(
          function (message) {
            var content = ipyMessage.getContent(message);
            ipyWatch.getWatchedExpressions(kernelID).forEach(function (expression) {
              ipyWatch.setValue(kernelID, expression, content.user_expressions[expression]);
            });
            deferred.resolve(message);
          },
          function (error) {
            deferred.reject(error);
          },
          function (notification) {
            deferred.notify(notification);
          }
        );
        return deferred.promise;
      };

      kernel.evaluate = function (kernelID, expression) {
        var expressions = {};
        expressions[expression] = expression;
        var message = ipyMessage.makeExecuteMessage('', true, false, expressions, false);

        return ipyMessageHandler.sendShellRequest(kernelID, message).then(
          function (message) {
            return ipyMessage.getContent(message).user_expressions[expression];
          }
        );
      };

      kernel.inspect = function (kernelID, code, cursorPosition, detailLevel) {
        var message = ipyMessage.makeInspectMessage(code, cursorPosition, detailLevel);
        return ipyMessageHandler.sendShellRequest(kernelID, message).then(
          function (message) {
            return ipyMessage.getContent(message);
          }
        );
      };

      kernel.complete = function (kernelID, code, cursorPosition) {
        var message = ipyMessage.makeCompleteMessage(code, cursorPosition);
        return ipyMessageHandler.sendShellRequest(kernelID, message).then(
          function (message) {
            return ipyMessage.getContent(message);
          }
        );
      };

      kernel.getHistory = function (kernelID, historyMessage) {
        var hasOutput = ipyMessage.getContent(historyMessage).output;
        return ipyMessageHandler.sendShellRequest(kernelID, historyMessage).then(
          function (message) {
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
          }
        );
      };

      kernel.historySearch = function (kernelID, pattern, numResults, getUnique, getOutput, getRaw) {
        getOutput = _.isUndefined(getOutput) ? true : getOutput;
        getRaw = _.isUndefined(getRaw) ? true : getRaw;
        getUnique = _.isUndefined(getUnique) ? false : getUnique;
        var message = ipyMessage.makeHistoryMessage(getOutput, getRaw, 'search', null, null, null,
          numResults, pattern, getUnique);
        return kernel.getHistory(kernelID, message);
      };

      kernel.historyRange = function (kernelID, start, stop, getOutput, getRaw) {
        var message = ipyMessage.makeHistoryMessage(getOutput, getRaw, 'range', null, start, stop);
        return kernel.getHistory(kernelID, message);
      };

      kernel.historyTail = function (kernelID, numResults, getOutput, getRaw) {
        getOutput = _.isUndefined(getOutput) ? true : getOutput;
        getRaw = _.isUndefined(getRaw) ? true : getRaw;
        var message = ipyMessage.makeHistoryMessage(getOutput, getRaw, 'tail', null, null, null, numResults);
        return kernel.getHistory(kernelID, message);
      };

      return kernel;
    }
  ])
;