angular.module('ipyng.kernel.watch', ['ng.lodash', 'ipyng.kernel.kernelManager']).
  factory('ipyWatch', function (_, $injector) {
    var ipyWatch = {};
    ipyWatch.expressions = {};
    ipyWatch.createWatch = function (kernel, expression) {
      var kernelID;
      if(_.isObject(kernel)) kernelID = kernel.kernelId;
      else kernelID = kernel;

      var uid = _.uniqueId();
      if (_.isUndefined(ipyWatch.expressions[kernelID])) {
        ipyWatch.expressions[kernelID] = {};
      }
      var thisWatch = ipyWatch.expressions[kernelID];
      if (_.isUndefined(thisWatch[expression])) {
        thisWatch[expression] = {};
        thisWatch[expression].uids = {};
      }
      thisWatch[expression].uids[uid] = true;
      var obj = {};
      obj.cancel = function () {
        ipyWatch.removeWatch(kernelID, expression, uid);
      };
      obj.getValue = function () {
        return ipyWatch.getValue(kernelID, expression);
      };
      obj.setValue = function(value) {
        return ipyWatch.setValue(kernelID, expression, value);
      };
      obj.refresh = function(){
        return ipyWatch.refresh(kernelID, expression);
      };

      obj.expression = expression;
      obj.uid = uid;
      return obj;
    };

    ipyWatch.removeWatch = function (kernelID, expression, uid) {
      var thisWatch = ipyWatch.expressions[kernelID][expression];
      delete thisWatch.uids[uid];
      if (_.keys(thisWatch.uids).length === 0) {
        delete ipyWatch.expressions[kernelID][expression];
      }
    };

    ipyWatch.setValue = function (kernelID, expression, value) {
      ipyWatch.expressions[kernelID][expression].value = value;
    };

    ipyWatch.getValue = function (kernelID, expression) {
      return ipyWatch.expressions[kernelID][expression].value;
    };

    ipyWatch.refresh = function (kernelId, expression) {
      var ipyKernel = $injector.get('ipyKernel');
      return ipyKernel.evaluate(kernelId, expression)
        .then(function(result){
          ipyWatch.setValue(kernelId, expression, result);
        });
    };

    ipyWatch.getWatchedExpressions = function (kernelID) {
      if (_.isUndefined(ipyWatch.expressions[kernelID])) {
        ipyWatch.expressions[kernelID] = {};
      }
      return Object.keys(ipyWatch.expressions[kernelID]);
    };

    return ipyWatch;
  })
;