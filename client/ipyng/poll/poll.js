angular.module('ipyng.poll', ['ipyng.kernel', 'ipyng.utils', 'ng.lodash']).
  factory('ipyPoll', function (ipyKernel, $interval, _) {
    var ipyPoll = {};
    ipyPoll.expressions = {};
    ipyPoll.delays = Object.create(null);
    ipyPoll.intervals = {};
    ipyPoll.createPoll = function (kernel, expression, delay) {
      var kernelID;
      if(_.isObject(kernel)) kernelID = kernel.kernelId;
      else kernelID = kernel;

      var uid = _.uniqueId();
      if (_.isUndefined(ipyPoll.expressions[kernelID])) {
        ipyPoll.expressions[kernelID] = {};
      }
      var thisPoll = ipyPoll.expressions[kernelID];
      if (_.isUndefined(thisPoll[expression])) {
        thisPoll[expression] = {};
        thisPoll[expression].uids = {};
      }
      thisPoll[expression].uids[uid] = delay;
      ipyPoll.updateInterval(kernelID, expression);

      var obj = {};
      obj.cancel = function () {
        ipyPoll.removePoll(kernelID, expression, uid);
      };
      obj.getValue = function () {
        return ipyPoll.getValue(kernelID, expression);
      };
      obj.refresh = function(value) {
        return ipyPoll.refresh(kernelID, expression, value);
      };

      obj.expression = expression;
      obj.uid = uid;
      return obj;
    };

    ipyPoll.updateInterval = function (kernelID, expression) {
      var minDelay;
      var thisPoll = ipyPoll.expressions[kernelID][expression];
      minDelay = _.min(_.values(thisPoll.uids));
      if (!_.isUndefined(thisPoll.interval)) {
        $interval.cancel(thisPoll.interval);
      }
      thisPoll.interval = $interval(function () {
        ipyPoll.refresh(kernelID, expression);
      }, minDelay);
    };

    ipyPoll.removePoll = function (kernelID, expression, uid) {
      var thisPoll = ipyPoll.expressions[kernelID][expression];
      delete thisPoll.uids[uid];
      if (_.keys(thisPoll.uids).length === 0) {
        $interval.cancel(thisPoll.interval);
        delete ipyPoll.expressions[kernelID][expression];
      }
    };

    ipyPoll.refresh = function(kernelId, expression) {
      ipyKernel.evaluate(kernelId, expression)
        .then(function(result){
          ipyPoll.setValue(kernelId, expression, result);
        });
    };

    ipyPoll.setValue = function (kernelID, expression, value) {
      ipyPoll.expressions[kernelID][expression].value = value;
    };
    ipyPoll.getValue = function (kernelID, expression) {
      return ipyPoll.expressions[kernelID][expression].value;
    };
    ipyPoll.getPolledExpressions = function (kernelID) {
      return _.keys(ipyPoll.expressions[kernelID]);
    };
    return ipyPoll;
  })
;