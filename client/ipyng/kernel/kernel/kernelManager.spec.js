describe("ipyKernel", function () {
  beforeEach(module('ipyng.kernel.messageHandler'));
  beforeEach(module('ipyng.kernel.kernelManager'));

  var $httpBackend, $q, $rootScope, ipyMessage;
  var messageHandlerMock = function () {
    var mock = {};

    mock.reset = function () {
      mock.deferred = null;
      mock.kernelId = null;
      mock.message = null;
      mock.subscribed = {};
    };

    mock.resolve = function (result) {
      mock.notify(ipyMessage.makeStatusReply('idle', ipyMessage.getParentHeader(result)));
      mock.deferred.resolve(result);
    };

    mock.notify = function (message) {
      mock.deferred.notify(message);
    };

    mock.sendShellRequest = function (kernelId, message) {
      mock.deferred = $q.defer();
      mock.kernelId = kernelId;
      mock.message = message;
      if(ipyMessage.getMessageType(message) == 'kernel_info_request')
        mock.resolve(ipyMessage.makeMessage('kernel_info_reply', {}, ipyMessage.getParentHeader(message)));
      return mock.deferred.promise;
    };

    mock.registerChannel = function (kernelGuid) {
      mock.subscribed[kernelGuid] = true;
      var unsubscribe = function(){
        mock.subscribed[kernelGuid] = false;
      };
      return unsubscribe;
    };

    return mock;
  };

  beforeEach(module(function ($provide) {
    $provide.factory("ipyMessageHandler", messageHandlerMock);
  }));

  beforeEach(inject(function (_$httpBackend_, _$q_, ipyMessageHandler, _$rootScope_, _ipyMessage_) {
    $httpBackend = _$httpBackend_;
    $q = _$q_;
    $rootScope = _$rootScope_;
    ipyMessage = _ipyMessage_;
    ipyMessageHandler.reset();
  }));

  var kernel1Id = 'kernel1';
  var kernel2Id = 'kernel2';
  var kernel1Guid = 1;
  var kernel2Guid = 2;
  var pending = 0;
  var resolved = 1;
  var rejected = 2;

  describe('retrieveKernels', function(){
    it("should return a list of kernels from /api/kernels/", inject(function (ipyKernel) {
      var kernels;
      $httpBackend.expectGET('/api/kernels/').respond([{id: kernel1Guid}, {id: kernel2Guid}]);
      ipyKernel.retrieveStartedKernels().then(function(_kernels){
        kernels = _kernels;
      });
      $httpBackend.flush();
      expect(kernels).toContain(kernel1Guid);
      expect(kernels).toContain(kernel2Guid);
    }));
  });

  describe("api function", function () {
    beforeEach(inject(function(ipyMessageHandler){
      $httpBackend.expectPOST('/api/startkernel/').respond({id: kernel1Guid});
    }));

    describe('startKernel', function(){
      it("should post to /api/startkernel/ when starting kernel", inject(function (ipyKernel) {
        ipyKernel.startKernel(kernel1Id);
      }));

      it("should resolve the kernel promise after response from /api/startkernel/", inject(function (ipyKernel) {
        var kernelGuid;
        ipyKernel.startKernel(kernel1Id)
          .then(function(kernel){
            kernelGuid = kernel.guid;
          });
        $httpBackend.flush();
        $rootScope.$apply();
        expect(kernelGuid).toEqual(kernel1Guid);
      }));
    });

    describe('interruptKernel', function(){
      it("should post to /api/kernels/interrupt/{kernelGuid} when interrupting a kernel", inject(
        function (ipyKernel) {
          ipyKernel.startKernel(kernel1Id);
          $httpBackend.flush();
          $httpBackend.expectPOST('/api/kernels/interrupt/' + kernel1Guid).respond({});
          ipyKernel.interruptKernel(kernel1Id);
          $httpBackend.flush();
        }
      ));
    });

    describe('restartKernel', function(){
      it("should post to /api/kernels/restart/{kernelGuid} when restarting a kernel", inject(function (ipyKernel) {
        ipyKernel.startKernel(kernel1Id);
        $httpBackend.flush();
        $httpBackend.expectPOST('/api/kernels/restart/' + kernel1Guid).respond({});
        ipyKernel.restartKernel(kernel1Id);
        $httpBackend.flush();
      }));
    });
  });

  describe("kernel messages", function(){
    beforeEach(inject(function(ipyKernel){
      $httpBackend.expectPOST('/api/startkernel/').respond({id: kernel1Guid});
      ipyKernel.startKernel(kernel1Id);
      $httpBackend.flush();
    }));

    describe("execute", function () {
      it("should send a shell request to the specified kernel containing the sent code,  " +
        "notify with iopub stream messages, and resolve with the execute reply",
        inject(function (ipyKernel, ipyMessage, ipyMessageHandler) {
          var code = "this is some code";
          var promise = ipyKernel.execute(kernel1Id, code);
          expect(ipyMessageHandler.kernelId).toEqual(kernel1Guid);
          var sentMessage = ipyMessageHandler.message;
          var content = ipyMessage.getContent(sentMessage);
          expect(content.code).toEqual(code);

          var executeResult = null;
          var iopubMessages = [];
          promise.then(function (result) {
              executeResult = result;
            }, null,
            function (iopubMessage) {
              iopubMessages.push(iopubMessage);
            });

          var parentHeader = ipyMessage.getHeader(sentMessage);
          var text = 'somemessage';
          var firstMessage = ipyMessage.makeIopubStream(text, parentHeader);
          ipyMessageHandler.notify(firstMessage);
          $rootScope.$apply();

          expect(iopubMessages[0]).toEqual(text);

          var text2 = 'somemessage2';
          var secondMessage = ipyMessage.makeIopubStream(text2, parentHeader);
          ipyMessageHandler.notify(secondMessage);
          $rootScope.$apply();
          expect(iopubMessages[1]).toEqual(text2);

          var out = {'text/plain': 'the output'};
          var outMessage = ipyMessage.makeExecuteResult(out, 1, {}, parentHeader);
          ipyMessageHandler.notify(outMessage);

          var display = {'image/png': 'arbitrarypng'};
          var displayMessage = ipyMessage.makeIopubDisplay(display, parentHeader);
          ipyMessageHandler.notify(displayMessage);
          $rootScope.$apply();

          var response = ipyMessage.makeExecuteReply('ok', 1, {}, []);
          ipyMessageHandler.resolve(response);
          $rootScope.$apply();
          expect(executeResult.text).toEqual(out['text/plain']);
          expect(executeResult['image/png']).toEqual(display['image/png']);
        })
      );

      it("should include watched expressions for specified kernel in it's execute request when watches are enabled",
        inject(function (ipyKernel, ipyMessage, ipyWatch, ipyMessageHandler) {
          var testExpression = 'this is a test expression';
          ipyWatch.createWatch(kernel1Id, testExpression);
          ipyKernel.execute(kernel1Id, 'some code');
          var content = ipyMessage.getContent(ipyMessageHandler.message);
          var user_expressions = {};
          user_expressions[testExpression] = testExpression;
          expect(content.user_expressions).toEqual(user_expressions);

          var testExpression2 = 'this is test expression 2';
          ipyWatch.createWatch(kernel1Id, testExpression2);
          ipyKernel.execute(kernel1Id, 'some more code');
          $rootScope.$apply();
          user_expressions[testExpression2] = testExpression2;
          content = ipyMessage.getContent(ipyMessageHandler.message);
          expect(content.user_expressions).toEqual(user_expressions);

          ipyKernel.execute(kernel1Id, 'even more code', false);
          $rootScope.$apply();
          content = ipyMessage.getContent(ipyMessageHandler.message);
          expect(content.user_expressions).toEqual({});

          ipyKernel.startKernel(kernel2Id);
          $httpBackend.expectPOST('/api/startkernel/').respond({id: kernel2Guid});
          $httpBackend.flush();
          ipyKernel.execute(kernel2Id, 'different kernel code');
          content = ipyMessage.getContent(ipyMessageHandler.message);
          expect(content.user_expressions).toEqual({});
        })
      );

      it("should pass appropriate options to the execute request",
        inject(function (ipyKernel, ipyMessage, ipyMessageHandler) {
          ipyKernel.execute(kernel1Id, 'some code', null, true, true, true);
          var content = ipyMessage.getContent(ipyMessageHandler.message);
          expect(content.silent).toBeTruthy();
          expect(content.store_history).toBeTruthy();
          expect(content.allow_stdin).toBeTruthy();

          ipyKernel.execute(kernel1Id, 'some more code', null, false, false, false);
          $rootScope.$apply();
          content = ipyMessage.getContent(ipyMessageHandler.message);
          expect(content.silent).toBeFalsy();
          expect(content.store_history).toBeFalsy();
          expect(content.allow_stdin).toBeFalsy();

          //Test defaults
          ipyKernel.execute(kernel1Id, 'even more code');
          $rootScope.$apply();
          content = ipyMessage.getContent(ipyMessageHandler.message);
          expect(content.silent).toBeFalsy();
          expect(content.store_history).toBeTruthy();
          expect(content.allow_stdin).toBeFalsy();
        })
      );
    });

    describe("evaluate", function () {
      it("should return the results of the expression in a resolved promise",
        inject(function (ipyKernel, ipyMessage, ipyMessageHandler) {
          var expression = "expression to evaluate";
          var evaluateResult = null;
          ipyKernel.evaluate(kernel1Id, expression).then(function (result) {
            evaluateResult = result;
          });
          var content = ipyMessage.getContent(ipyMessageHandler.message);
          expect(content.user_expressions[0]).toEqual(expression);

          var expressionResult = "this is the result of the expression";
          var user_expressions = {};
          user_expressions[0] = {data: {'text/plain': expressionResult}};
          var message = ipyMessage.makeExecuteReply('ok', 1, user_expressions);
          ipyMessageHandler.resolve(message);
          $rootScope.$apply();
          expect(evaluateResult.text).toEqual(expressionResult);
        })
      );
    });

    describe("inspect", function () {
      it("should create an inspect message with code, cursorPosition, and detail level then " +
        "return the result of the response in a promise",
        inject(function (ipyKernel, ipyMessage, ipyMessageHandler) {
          var code = 'some code';
          var cursorPosition = code.length;
          var detailLevel = 1;
          var inspectResult = null;
          ipyKernel.inspect(kernel1Id, code, cursorPosition, detailLevel).then(function (result) {
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
        inject(function (ipyKernel, ipyMessage, ipyMessageHandler) {
          var code = 'some code';
          var cursorPosition = code.length;
          var completeResult = null;
          ipyKernel.inspect(kernel1Id, code, cursorPosition).then(function (result) {
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
        inject(function (ipyKernel, ipyMessage, ipyMessageHandler) {
          var pattern = 'the pattern';
          var numResults = 5;
          var historyResult = null;
          ipyKernel.historySearch(kernel1Id, 'the pattern', numResults).then(function (result) {
            historyResult = result;
          });
          var content = ipyMessage.getContent(ipyMessageHandler.message);
          var header = ipyMessage.getHeader(ipyMessageHandler.message);
          expect(content.pattern).toEqual(pattern);
          expect(content.n).toEqual(numResults);
          var session = ipyMessage.session;
          var history = [
            [session, 1, ['first input', 'first output']],
            [session, 2, ['second input', 'second output']],
            [session, 3, ['third input', 'third output']]
          ];
          var response = ipyMessage.makeHistoryReply(history, header);
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
          ipyKernel.historyRange(kernel1Id, start, stop, getOutput).then(function (result) {
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
          ipyKernel.historyTail(kernel1Id, lastN, getOutput).then(function (result) {
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