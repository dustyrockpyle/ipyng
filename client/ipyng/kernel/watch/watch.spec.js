describe('ipyWatch', function () {
  beforeEach(module('ipyng.kernel.watch'));
  beforeEach(module('ng.lodash'));
  var expression1 = 'first expression';
  var expression2 = 'second expression';
  var kernel1ID = 'kernel1';
  var kernel2ID = 'kernel2';

  describe('createWatch', function () {
    it('should return a watch with getValue and cancel functions', inject(function (ipyWatch) {
      var watch = ipyWatch.createWatch(kernel1ID, expression1);
      expect(watch.getValue).toBeDefined();
      expect(watch.cancel).toBeDefined();
    }));

    it('should record a new uid for each created kernel/expression pair', inject(function (ipyWatch, _) {
      var k1watch1 = ipyWatch.createWatch(kernel1ID, expression1);
      expect(_.keys(ipyWatch.expressions[kernel1ID][expression1].uids).length).toEqual(1);
      var k1watch2 = ipyWatch.createWatch(kernel1ID, expression1);
      expect(_.keys(ipyWatch.expressions[kernel1ID][expression1].uids).length).toEqual(2);
      var k1watch3 = ipyWatch.createWatch(kernel1ID, expression2);
      expect(_.keys(ipyWatch.expressions[kernel1ID][expression2].uids).length).toEqual(1);
      var k1watch4 = ipyWatch.createWatch(kernel1ID, expression2);
      expect(_.keys(ipyWatch.expressions[kernel1ID][expression2].uids).length).toEqual(2);
      var k2watch1 = ipyWatch.createWatch(kernel2ID, expression1);
      expect(_.keys(ipyWatch.expressions[kernel2ID][expression1].uids).length).toEqual(1);
      var k2watch2 = ipyWatch.createWatch(kernel2ID, expression1);
      expect(_.keys(ipyWatch.expressions[kernel2ID][expression1].uids).length).toEqual(2);
      var k2watch3 = ipyWatch.createWatch(kernel2ID, expression2);
      expect(_.keys(ipyWatch.expressions[kernel2ID][expression2].uids).length).toEqual(1);
      var k2watch4 = ipyWatch.createWatch(kernel2ID, expression2);
      expect(_.keys(ipyWatch.expressions[kernel2ID][expression2].uids).length).toEqual(2);
    }));
  });

  describe('', function () {
    var k1expression1watch1, k1expression1watch2, k1expression2watch1, k1expression2watch2,
      k2expression1watch1, k2expression1watch2, k2expression2watch1, k2expression2watch2;
    beforeEach(inject(function (ipyWatch) {
      k1expression1watch1 = ipyWatch.createWatch(kernel1ID, expression1);
      k1expression1watch2 = ipyWatch.createWatch(kernel1ID, expression1);
      k1expression2watch1 = ipyWatch.createWatch(kernel1ID, expression2);
      k1expression2watch2 = ipyWatch.createWatch(kernel1ID, expression2);
      k2expression1watch1 = ipyWatch.createWatch(kernel2ID, expression1);
      k2expression1watch2 = ipyWatch.createWatch(kernel2ID, expression1);
      k2expression2watch1 = ipyWatch.createWatch(kernel2ID, expression2);
      k2expression2watch2 = ipyWatch.createWatch(kernel2ID, expression2);
    }));

    var value1 = 'value1';
    var value2 = 'value2';
    var value3 = 'value3';
    describe('removeWatch', function () {
      it('should remove the uid for the kernel/expression pair, delete the expression if no remaining uids', inject(
        function (ipyWatch, _) {
          ipyWatch.removeWatch(kernel1ID, expression1, k1expression1watch1.uid);
          expect(_.keys(ipyWatch.expressions[kernel1ID][expression1].uids).length).toEqual(1);
          ipyWatch.removeWatch(kernel1ID, expression1, k1expression1watch2.uid);
          expect(ipyWatch.expressions[kernel1ID][expression1]).toBeUndefined();
        }
      ));
    });

    describe('getWatchedExpressions', function () {
      it('should return a list of expressions defined for a kernel', inject(function (ipyWatch) {
        var kernel1Expressions = ipyWatch.getWatchedExpressions(kernel1ID);
        expect(kernel1Expressions).toContain(expression1);
        expect(kernel1Expressions).toContain(expression2);
        var expression3 = 'third expression';
        ipyWatch.createWatch(kernel1ID, expression3);
        kernel1Expressions = ipyWatch.getWatchedExpressions(kernel1ID);
        expect(kernel1Expressions).toContain(expression3);
        expect(kernel1Expressions.length).toEqual(3);
        var kernel2Expressions = ipyWatch.getWatchedExpressions(kernel2ID);
        expect(kernel2Expressions).toContain(expression1);
        expect(kernel2Expressions).toContain(expression2);
        expect(kernel2Expressions).not.toContain(expression3);
      }));
    });

    describe('setValue and getValue', function () {
      it('should set a value for a kernel/expression pair that is retrieved with getValue', inject(
        function (ipyWatch) {
          ipyWatch.setValue(kernel1ID, expression1, value1);
          expect(ipyWatch.getValue(kernel1ID, expression1)).toEqual(value1);
          ipyWatch.setValue(kernel1ID, expression1, value2);
          expect(ipyWatch.getValue(kernel1ID, expression1)).toEqual(value2);
        }
      ));
    });

    describe('returned watch object', function () {
      it('should have a getValue function that returns values set with setValue', inject(
        function (ipyWatch) {
          ipyWatch.setValue(kernel1ID, expression1, value1);
          expect(k1expression1watch1.getValue()).toEqual(value1);
          expect(k1expression1watch2.getValue()).toEqual(value1);
          ipyWatch.setValue(kernel1ID, expression1, value2);
          expect(k1expression1watch1.getValue()).toEqual(value2);
          expect(k1expression1watch2.getValue()).toEqual(value2);

          ipyWatch.setValue(kernel1ID, expression2, value1);
          expect(k1expression2watch1.getValue()).toEqual(value1);
          expect(k1expression1watch1.getValue()).toEqual(value2);

          ipyWatch.setValue(kernel2ID, expression1, value3);
          expect(k2expression1watch1.getValue()).toEqual(value3);
          expect(k2expression1watch2.getValue()).toEqual(value3);
        }
      ));

      it('should remove the watch uid when cancel is called, and remove the expression ' +
        'when all watches are cancelled',
        inject(function (ipyWatch, _) {
          expect(_.keys(ipyWatch.expressions[kernel1ID][expression1].uids).length).toEqual(2);
          k1expression1watch1.cancel();
          expect(_.keys(ipyWatch.expressions[kernel1ID][expression1].uids).length).toEqual(1);
          k1expression1watch2.cancel();
          expect(ipyWatch.expressions[kernel1ID][expression1]).toBeUndefined();
        })
      );
    });
  });
});