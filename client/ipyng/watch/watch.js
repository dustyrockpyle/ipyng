(function(angular){
  'use strict';

  angular.module('ipyng.watch', ['ng.lodash', 'ipyng.messageHandler', 'ipyng.kernel'])
    .config(config)
    .factory('$ipyWatch', ipyWatchFactory);

  function config ($provide) {
    // I don't know how to test this but it seems to work well...
    // TODO: Test this magic.
    $provide.decorator('$ipyMessageHandler', function($delegate, $injector){
      var messageHandler = $delegate;
      var handleIopubMessage = messageHandler.handleIopubMessage;
      messageHandler.handleIopubMessage = function(message){
        var ipyMessage = $injector.get('$ipyMessage');
        if(ipyMessage.getMessageType(message) == 'execute_input') {
          var guid = ipyMessage.getKernelGuid(message);
          var kernel = $injector.get('$ipyKernel').kernelGuids[guid];
          $injector.get('$ipyWatch').refresh(kernel.id);
        }
        handleIopubMessage(message);
      };
      return $delegate;
    });
  }

  function ipyWatchFactory (_, $ipyKernel, $q) {
    var $ipyWatch = {
      expressions: {},
      createWatch: createWatch,
      removeWatch: removeWatch,
      setValue: setValue,
      getValue: getValue,
      refresh: refresh,
      getWatchedExpressions: getWatchedExpressions
    };

    return $ipyWatch;

    function createWatch (kernel, expression) {
      var kernelID;
      if(_.isObject(kernel)) kernelID = kernel.id;
      else kernelID = kernel;

      var uid = _.uniqueId();
      if (_.isUndefined($ipyWatch.expressions[kernelID])) {
        $ipyWatch.expressions[kernelID] = {};
      }
      var thisWatch = $ipyWatch.expressions[kernelID];
      if (_.isUndefined(thisWatch[expression])) {
        thisWatch[expression] = {};
        thisWatch[expression].uids = {};
      }
      thisWatch[expression].uids[uid] = true;
      var obj = {};
      obj.cancel = function () {
        $ipyWatch.removeWatch(kernelID, expression, uid);
      };
      obj.getValue = function () {
        return $ipyWatch.getValue(kernelID, expression);
      };
      obj.setValue = function(value) {
        return $ipyWatch.setValue(kernelID, expression, value);
      };
      obj.refresh = function(){
        return $ipyWatch.refresh(kernelID, expression);
      };

      obj.expression = expression;
      obj.uid = uid;
      return obj;
    }

    function removeWatch (kernelID, expression, uid) {
      var thisWatch = $ipyWatch.expressions[kernelID][expression];
      delete thisWatch.uids[uid];
      if (_.keys(thisWatch.uids).length === 0) {
        delete $ipyWatch.expressions[kernelID][expression];
      }
    }

    function setValue (kernelID, expression, value) {
      $ipyWatch.expressions[kernelID][expression].value = value;
    }

    function getValue (kernelID, expression) {
      return $ipyWatch.expressions[kernelID][expression].value;
    }

    function refresh (kernelId, expressions) {
      if(!expressions) expressions = _.keys($ipyWatch.expressions[kernelId]);
      else if(!_.isArray(expressions)) expressions = [expressions];
      if(expressions.length === 0) return $q.when([]);
      return $ipyKernel.evaluate(kernelId, expressions)
        .then(function(results){
          _.forEach(results, function(result, key){
            $ipyWatch.setValue(kernelId, expressions[key], result);
          });
          return results;
        });
    }

    function getWatchedExpressions (kernelID) {
      if (_.isUndefined($ipyWatch.expressions[kernelID])) {
        $ipyWatch.expressions[kernelID] = {};
      }
      return Object.keys($ipyWatch.expressions[kernelID]);
    }
  }
})(angular);