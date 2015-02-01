describe("ipyng.kernel.kernel", function () {
  beforeEach(module('ipyng.messageHandler'));
  beforeEach(module('ipyng.kernel'));
  beforeEach(module('ngMockE2E'));
  describe("ipyKernel", function () {

    var $httpBackend, $q;
    var messageHandlerMock = function () {
      var mock = {};

      mock.reset = function () {
        mock.deferred = null;
        mock.kernelID = null;
        mock.message = null;
      };

      mock.resolve = function (result) {
        mock.deferred.resolve(result);
      };

      mock.notify = function (message) {
        mock.deferred.notify(message);
      };

      mock.sendShellRequest = function (kernelID, message) {
        mock.deferred = $q.defer();
        mock.kernelID = kernelID;
        mock.message = message;
        return mock.deferred.promise;
      };

      return mock;
    };

    beforeEach(module(function ($provide) {
      $provide.factory("ipyMessageHandler", messageHandlerMock);
    }));

    beforeEach(inject(function (_$httpBackend_, _$q_, ipyMessageHandler) {
      $httpBackend = _$httpBackend_;
      $httpBackend.expectGET('/api/kernels/').respond([{id: 'kernel1'}, {id: 'kernel2'}]);
      $q = _$q_;
      ipyMessageHandler.reset();
    }));

    var kernel1ID = 'kernel1';
    var kernel2ID = 'kernel2';
    var kernel3ID = 'kernel3';

    describe("api functions", function () {
      it("should have kernel1 and kernel2 defined", inject(
        function (ipyKernel) {
          $httpBackend.flush();
          expect(ipyKernel.kernels).toContain(kernel1ID);
          expect(ipyKernel.kernels).toContain(kernel2ID);
        }
      ));

      it("should post to /api/startkernel/{kernelID} when starting kernel", inject(
        function (ipyKernel, $rootScope) {
          $httpBackend.expectPOST('/api/startkernel/' + kernel3ID).respond({id: kernel3ID});
          ipyKernel.startKernel(kernel3ID);
          $httpBackend.flush();
          expect(ipyKernel.kernels).toContain(kernel3ID);
          var numKernels = ipyKernel.kernels.length;
          var rejected = false;
          ipyKernel.startKernel(kernel3ID).then(null, function () {
            rejected = true;
          });
          $rootScope.$apply();
          expect(ipyKernel.kernels.length).toEqual(numKernels);
          expect(rejected).toBeTruthy();
        }
      ));

      it("should post to /api/kernels/interrupt/{kernelID} when interrupting a kernel", inject(
        function (ipyKernel) {
          $httpBackend.expectPOST('/api/kernels/interrupt/' + kernel1ID).respond({});
          ipyKernel.interruptKernel(kernel1ID);
          $httpBackend.flush();
        }
      ));

      it("should post to /api/kernels/restart/{kernelID} when restarting a kernel", inject(
        function (ipyKernel) {
          $httpBackend.expectPOST('/api/kernels/restart/' + kernel1ID).respond({});
          ipyKernel.restartKernel(kernel1ID);
          $httpBackend.flush();
        }
      ));
    });

    describe("execute", function () {

      it("should send a shell request to the specified kernel containing the sent code,  " +
          "notify with iopub messages, and resolve with the execute reply",
        inject(function (ipyKernel, ipyMessage, ipyMessageHandler, $rootScope) {
          var code = "this is some code";
          var promise = ipyKernel.execute(kernel1ID, code);
          expect(ipyMessageHandler.kernelID).toEqual(kernel1ID);
          var sentMessage = ipyMessageHandler.message;
          var content = ipyMessage.getContent(sentMessage);
          expect(content.code).toEqual(code);

          var executeResult = null;
          var iopubMessages = [];
          promise.then(function (result) {
            executeResult = result;
          }, null, function (iopubMessage) {
            iopubMessages.push(iopubMessage);
          });

          var data = {'application/json': 'somemessage'};
          var firstMessage = ipyMessage.makeExecuteResult(1, data, {}, ipyMessage.getHeader(sentMessage));
          ipyMessageHandler.notify(firstMessage);
          $rootScope.$apply();
          expect(iopubMessages[0]).toEqual(firstMessage);

          var data2 = {'application/json': 'somemessage2'};
          var secondMessage = ipyMessage.makeExecuteResult(1, data2, {}, ipyMessage.getHeader(sentMessage));
          ipyMessageHandler.notify(secondMessage);
          $rootScope.$apply();
          expect(iopubMessages[1]).toEqual(secondMessage);

          var response = ipyMessage.makeExecuteReply('ok', 1, {}, []);
          ipyMessageHandler.resolve(response);
          $rootScope.$apply();
          expect(executeResult).toEqual(response);
        })
      );

      it("should include watched expressions for for specified kernel in it's execute request when watches are enabled",
        inject(function (ipyKernel, ipyMessage, ipyWatch, ipyMessageHandler) {
          var testExpression = 'this is a test expression';
          ipyWatch.createWatch(kernel1ID, testExpression);
          ipyKernel.execute(kernel1ID, 'some code');
          var content = ipyMessage.getContent(ipyMessageHandler.message);
          var user_expressions = {};
          user_expressions[testExpression] = testExpression;
          expect(content.user_expressions).toEqual(user_expressions);

          var testExpression2 = 'this is test expression 2';
          ipyWatch.createWatch(kernel1ID, testExpression2);
          ipyKernel.execute(kernel1ID, 'some more code');
          user_expressions[testExpression2] = testExpression2;
          content = ipyMessage.getContent(ipyMessageHandler.message);
          expect(content.user_expressions).toEqual(user_expressions);

          ipyKernel.execute(kernel1ID, 'even more code', false);
          content = ipyMessage.getContent(ipyMessageHandler.message);
          expect(content.user_expressions).toEqual({});

          ipyKernel.execute(kernel2ID, 'different kernel code');
          content = ipyMessage.getContent(ipyMessageHandler.message);
          expect(content.user_expressions).toEqual({});
        })
      );

      it("should pass appropriate options to the execute request",
        inject(function (ipyKernel, ipyMessage, ipyMessageHandler) {
          ipyKernel.execute(kernel1ID, 'some code', null, true, true, true);
          var content = ipyMessage.getContent(ipyMessageHandler.message);
          expect(content.silent).toBeTruthy();
          expect(content.store_history).toBeTruthy();
          expect(content.allow_stdin).toBeTruthy();

          ipyKernel.execute(kernel1ID, 'some more code', null, false, false, false);
          content = ipyMessage.getContent(ipyMessageHandler.message);
          expect(content.silent).toBeFalsy();
          expect(content.store_history).toBeFalsy();
          expect(content.allow_stdin).toBeFalsy();

          //Test defaults
          ipyKernel.execute(kernel1ID, 'even more code');
          content = ipyMessage.getContent(ipyMessageHandler.message);
          expect(content.silent).toBeFalsy();
          expect(content.store_history).toBeTruthy();
          expect(content.allow_stdin).toBeFalsy();
        })
      );
    });

    describe("evaluate", function () {
      it("should return the results of the expression in a resolved promise",
        inject(function (ipyKernel, ipyMessage, ipyMessageHandler, $rootScope) {
          var expression = "expression to evaluate";
          var evaluateResult = null;
          ipyKernel.evaluate(kernel1ID, expression).then(function (result) {
            evaluateResult = result;
          });
          var content = ipyMessage.getContent(ipyMessageHandler.message);
          expect(content.user_expressions[expression]).toEqual(expression);

          var expressionResult = "this is the result of the expression";
          var user_expressions = {};
          user_expressions[expression] = expressionResult;
          var message = ipyMessage.makeExecuteReply('ok', 1, user_expressions);
          ipyMessageHandler.resolve(message);
          $rootScope.$apply();
          expect(evaluateResult).toEqual(expressionResult);
        })
      );
    });

    describe("inspect", function () {
      it("should create an inspect message with code, cursorPosition, and detail level then " +
          "return the result of the response in a promise",
        inject(function (ipyKernel, ipyMessage, ipyMessageHandler, $rootScope) {
          var code = 'some code';
          var cursorPosition = code.length;
          var detailLevel = 1;
          var inspectResult = null;
          ipyKernel.inspect(kernel1ID, code, cursorPosition, detailLevel).then(function (result) {
            inspectResult = result;
          });
          var content = ipyMessage.getContent(ipyMessageHandler.message);
          expect(content.code).toEqual(code);
          expect(content.cursor_pos).toEqual(cursorPosition);
          expect(content.detail_level).toEqual(detailLevel);
          var response = ipyMessage.makeInspectReply('ok', {'application/json': 'result'}, {},
            ipyMessage.getHeader(ipyMessageHandler.message));
          ipyMessageHandler.resolve(response);
          $rootScope.$apply();
          expect(ipyMessage.getContent(response)).toEqual(inspectResult);
        })
      );
    });

    describe("complete", function () {
      it("should create a complete message with code and cursorPosition, and return the response in a promise",
        inject(function (ipyKernel, ipyMessage, ipyMessageHandler, $rootScope) {
          var code = 'some code';
          var cursorPosition = code.length;
          var completeResult = null;
          ipyKernel.inspect(kernel1ID, code, cursorPosition).then(function (result) {
            completeResult = result;
          });
          var content = ipyMessage.getContent(ipyMessageHandler.message);
          expect(content.code).toEqual(code);
          expect(content.cursor_pos).toEqual(cursorPosition);
          var response = ipyMessage.makeInspectReply('ok', {'application/json': 'result'}, {},
            ipyMessage.getHeader(ipyMessageHandler.message));
          ipyMessageHandler.resolve(response);
          $rootScope.$apply();
          expect(ipyMessage.getContent(response)).toEqual(completeResult);
        })
      );
    });

    describe("historySearch", function () {
      it("should create a search history message and return the response in a promise",
        inject(function (ipyKernel, ipyMessage, ipyMessageHandler, $rootScope) {
          var pattern = 'the pattern';
          var numResults = 5;
          var historyResult = null;
          ipyKernel.historySearch(kernel1ID, 'the pattern', numResults).then(function (result) {
            historyResult = result;
          });
          var content = ipyMessage.getContent(ipyMessageHandler.message);
          expect(content.pattern).toEqual(pattern);
          expect(content.n).toEqual(numResults);
          var session = ipyMessage.session;
          var history = [
            [session, 1, ['first input', 'first output']],
            [session, 2, ['second input', 'second output']],
            [session, 3, ['third input', 'third output']]
          ];
          var response = ipyMessage.makeHistoryReply(history);
          ipyMessageHandler.resolve(response);
          $rootScope.$apply();
          expect(historyResult[0].input).toEqual(history[0][2][0]);
          expect(historyResult[0].output).toEqual(history[0][2][1]);
          expect(historyResult[0].lineNumber).toEqual(history[0][1]);
          expect(historyResult[0].session).toEqual(history[0][0]);
          expect(historyResult[1].output).toEqual(history[1][2][1]);
          expect(historyResult[2].lineNumber).toEqual(history[2][1]);
        })
      );
    });

    describe("historyRange", function () {
      it("should create a range history message and return the response in a promise",
        inject(function (ipyKernel, ipyMessage, ipyMessageHandler, $rootScope) {
          var start = 1;
          var stop = 3;
          var getOutput = false;
          var historyResult = null;
          ipyKernel.historyRange(kernel1ID, start, stop, getOutput).then(function (result) {
            historyResult = result;
          });
          var content = ipyMessage.getContent(ipyMessageHandler.message);
          expect(content.start).toEqual(start);
          expect(content.stop).toEqual(stop);
          var session = ipyMessage.session;
          var history = [
            [session, 1, 'first input'],
            [session, 2, 'second input'],
            [session, 3, 'third input']
          ];
          var response = ipyMessage.makeHistoryReply(history);
          ipyMessageHandler.resolve(response);
          $rootScope.$apply();
          expect(historyResult[0].input).toEqual(history[0][2]);
          expect(historyResult[0].lineNumber).toEqual(history[0][1]);
          expect(historyResult[0].session).toEqual(history[0][0]);
          expect(historyResult[1].input).toEqual(history[1][2]);
          expect(historyResult[2].lineNumber).toEqual(history[2][1]);
        })
      );
    });

    describe("historyTail", function () {
      it("should create a tail history message and return the response in a promise",
        inject(function (ipyKernel, ipyMessage, ipyMessageHandler, $rootScope) {
          var lastN = 3;
          var getOutput = false;
          var historyResult = null;
          ipyKernel.historyTail(kernel1ID, lastN, getOutput).then(function (result) {
            historyResult = result;
          });
          var content = ipyMessage.getContent(ipyMessageHandler.message);
          expect(content.n).toEqual(lastN);
          var session = ipyMessage.session;
          var history = [
            [session, 1, 'first input'],
            [session, 2, 'second input'],
            [session, 3, 'third input']
          ];
          var response = ipyMessage.makeHistoryReply(history);
          ipyMessageHandler.resolve(response);
          $rootScope.$apply();
          expect(historyResult[0].input).toEqual(history[0][2]);
          expect(historyResult[0].lineNumber).toEqual(history[0][1]);
          expect(historyResult[0].session).toEqual(history[0][0]);
          expect(historyResult[1].input).toEqual(history[1][2]);
          expect(historyResult[2].lineNumber).toEqual(history[2][1]);
        })
      );
    });

  });
})
;