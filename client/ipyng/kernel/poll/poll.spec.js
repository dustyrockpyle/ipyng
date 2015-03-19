describe('ipyPoll', function () {
  beforeEach(module('ipyng.kernel.poll'));
  beforeEach(module('ng.lodash'));

  var $q, $interval;
  var ipyKernelMock = function () {
    var mock = {};
    mock.deferred = [];
    mock.evaluate = function (kernelID, expression) {
      mock.deferred.push($q.defer());
      return mock.deferred[mock.deferred.length - 1].promise;
    };
    mock.resolve = function (value) {
      mock.deferred.forEach(function (deferred) {
        deferred.resolve({data: {'text/plain': value}, text: value});
      });
    };
    return mock;
  };

  beforeEach(module(function ($provide) {
    $provide.factory("ipyKernel", ipyKernelMock);
  }));

  beforeEach(inject(function (_$q_, _$interval_) {
    $q = _$q_;
    $interval = _$interval_;
  }));

  var expression1 = 'first expression';
  var expression2 = 'second expression';
  var kernel1ID = 'kernel1';
  var kernel2ID = 'kernel2';
  var delay1 = 1000;
  var delay2 = 2000;

  describe('createPoll', function () {
    it('should return a poll with getValue and cancel functions', inject(function (ipyPoll) {
      var watch = ipyPoll.createPoll(kernel1ID, expression1, delay1);
      expect(watch.getValue).toBeDefined();
      expect(watch.cancel).toBeDefined();
    }));

    it('should record a new uid for each created kernel/expression pair', inject(function (ipyPoll, _) {
      var k1watch1 = ipyPoll.createPoll(kernel1ID, expression1, delay1);
      expect(_.keys(ipyPoll.expressions[kernel1ID][expression1].uids).length).toEqual(1);
      var k1watch2 = ipyPoll.createPoll(kernel1ID, expression1, delay1);
      expect(_.keys(ipyPoll.expressions[kernel1ID][expression1].uids).length).toEqual(2);
      var k1watch3 = ipyPoll.createPoll(kernel1ID, expression2, delay2);
      expect(_.keys(ipyPoll.expressions[kernel1ID][expression2].uids).length).toEqual(1);
      var k1watch4 = ipyPoll.createPoll(kernel1ID, expression2, delay2);
      expect(_.keys(ipyPoll.expressions[kernel1ID][expression2].uids).length).toEqual(2);
      var k2watch1 = ipyPoll.createPoll(kernel2ID, expression1, delay1);
      expect(_.keys(ipyPoll.expressions[kernel2ID][expression1].uids).length).toEqual(1);
      var k2watch2 = ipyPoll.createPoll(kernel2ID, expression1, delay1);
      expect(_.keys(ipyPoll.expressions[kernel2ID][expression1].uids).length).toEqual(2);
      var k2watch3 = ipyPoll.createPoll(kernel2ID, expression2, delay2);
      expect(_.keys(ipyPoll.expressions[kernel2ID][expression2].uids).length).toEqual(1);
      var k2watch4 = ipyPoll.createPoll(kernel2ID, expression2, delay2);
      expect(_.keys(ipyPoll.expressions[kernel2ID][expression2].uids).length).toEqual(2);
    }));
  });

  describe('', function () {
    var k1expression1watch1, k1expression1watch2, k1expression2watch1, k1expression2watch2,
      k2expression1watch1, k2expression1watch2, k2expression2watch1, k2expression2watch2;
    beforeEach(inject(function (ipyPoll) {
      k1expression1watch1 = ipyPoll.createPoll(kernel1ID, expression1, delay1);
      k1expression1watch2 = ipyPoll.createPoll(kernel1ID, expression1, delay1);
      k1expression2watch1 = ipyPoll.createPoll(kernel1ID, expression2, delay1);
      k1expression2watch2 = ipyPoll.createPoll(kernel1ID, expression2, delay2);
      k2expression1watch1 = ipyPoll.createPoll(kernel2ID, expression1, delay1);
      k2expression1watch2 = ipyPoll.createPoll(kernel2ID, expression1, delay1);
      k2expression2watch1 = ipyPoll.createPoll(kernel2ID, expression2, delay2);
      k2expression2watch2 = ipyPoll.createPoll(kernel2ID, expression2, delay2);
    }));

    describe('removePoll', function () {
      it('should remove the uid for the kernel/expression pair, delete the expression if no remaining uids', inject(
        function (ipyPoll, _) {
          expect(_.keys(ipyPoll.expressions[kernel1ID][expression1].uids).length).toEqual(2);
          ipyPoll.removePoll(kernel1ID, expression1, k1expression1watch1.uid);
          expect(_.keys(ipyPoll.expressions[kernel1ID][expression1].uids).length).toEqual(1);
          ipyPoll.removePoll(kernel1ID, expression1, k1expression1watch2.uid);
          expect(ipyPoll.expressions[kernel1ID][expression1]).toBeUndefined();
        }
      ));

    });

    describe('getPolledExpressions', function () {
      it('should return a list of expressions defined for a kernel', inject(function (ipyPoll) {
        var kernel1Expressions = ipyPoll.getPolledExpressions(kernel1ID);
        expect(kernel1Expressions).toContain(expression1);
        expect(kernel1Expressions).toContain(expression2);
        var expression3 = 'third expression';
        ipyPoll.createPoll(kernel1ID, expression3);
        kernel1Expressions = ipyPoll.getPolledExpressions(kernel1ID);
        expect(kernel1Expressions).toContain(expression3);
        expect(kernel1Expressions.length).toEqual(3);
        var kernel2Expressions = ipyPoll.getPolledExpressions(kernel2ID);
        expect(kernel2Expressions).toContain(expression1);
        expect(kernel2Expressions).toContain(expression2);
        expect(kernel2Expressions).not.toContain(expression3);
      }));
    });

    var value1 = 'value1';
    var value2 = 'value2';
    var value3 = 'value3';
    describe('setValue and getValue', function () {
      it('should set a value for a kernel/expression pair that is retrieved with getValue', inject(
        function (ipyPoll) {
          ipyPoll.setValue(kernel1ID, expression1, value1);
          expect(ipyPoll.getValue(kernel1ID, expression1)).toEqual(value1);
          ipyPoll.setValue(kernel1ID, expression1, value2);
          expect(ipyPoll.getValue(kernel1ID, expression1)).toEqual(value2);
        }
      ));

      it('should set the expression value after the delay has passed', inject(
        function (ipyKernel, $rootScope) {
          $interval.flush(delay1 / 2);
          expect(ipyKernel.deferred.length).toEqual(0);
          $interval.flush(delay1 / 2);
          ipyKernel.resolve(value1);
          $rootScope.$apply();
          expect(k1expression1watch1.getValue().text).toEqual(value1);
          expect(k1expression2watch1.getValue().text).toEqual(value1);
          expect(k2expression2watch1.getValue()).toBeUndefined();
          $interval.flush(delay2 - delay1);
          ipyKernel.resolve(value2);
          $rootScope.$apply();
          expect(k2expression2watch1.getValue().text).toEqual(value2);
        }
      ));
    });

    describe('returned watch object', function () {
      it('should have a getValue function that returns values set with setValue', inject(
        function (ipyPoll) {
          ipyPoll.setValue(kernel1ID, expression1, value1);
          expect(k1expression1watch1.getValue()).toEqual(value1);
          expect(k1expression1watch2.getValue()).toEqual(value1);
          ipyPoll.setValue(kernel1ID, expression1, value2);
          expect(k1expression1watch1.getValue()).toEqual(value2);
          expect(k1expression1watch2.getValue()).toEqual(value2);

          ipyPoll.setValue(kernel1ID, expression2, value1);
          expect(k1expression2watch1.getValue()).toEqual(value1);
          expect(k1expression1watch1.getValue()).toEqual(value2);

          ipyPoll.setValue(kernel2ID, expression1, value3);
          expect(k2expression1watch1.getValue()).toEqual(value3);
          expect(k2expression1watch2.getValue()).toEqual(value3);
        }
      ));
    });
  });
});