describe("ipyKernel", function () {
  beforeEach(module('ipyng.messageHandler'));
  beforeEach(module('ipyng.kernel'));

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

    mock.sendShellRequest = function (kernelId, message, iopubHandler, stdinHandler) {
      mock.deferred = $q.defer();
      mock.kernelId = kernelId;
      mock.message = message;
      mock.iopubHandler = iopubHandler;
      mock.stdinHandler = stdinHandler;
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

    var code = "this is some code";
    var promise;
    var sentMessage;
    var sentContent;
    var sentHeader;
    describe("execute", function () {
      beforeEach(inject(function(ipyKernel, ipyMessageHandler){
        promise = ipyKernel.execute(kernel1Id, code, false, false, true);
        $rootScope.$apply();
        sentMessage = ipyMessageHandler.message;
        sentContent = ipyMessage.getContent(sentMessage);
        sentHeader = ipyMessage.getHeader(sentMessage);
      }));

      it("should send a shell request to the specified kernel containing the sent code",
        inject(function (ipyKernel, ipyMessage, ipyMessageHandler) {
          expect(ipyMessageHandler.kernelId).toEqual(kernel1Guid);
          expect(sentContent.code).toEqual(code);
        }));

      it("should notify with iopub stream messages", inject(function(ipyKernel, ipyMessage, ipyMessageHandler){
        var iopubMessages = [];
        promise.then(null, null,
          function (iopubMessage) {
            iopubMessages.push(iopubMessage);
          });
        var text = 'somemessage';
        var firstMessage = ipyMessage.makeIopubStream(text, sentHeader);
        ipyMessageHandler.iopubHandler(firstMessage);
        $rootScope.$apply();
        expect(iopubMessages[0]).toEqual(text);
        var text2 = 'somemessage2';
        var secondMessage = ipyMessage.makeIopubStream(text2, sentHeader);
        ipyMessageHandler.iopubHandler(secondMessage);
        $rootScope.$apply();
        expect(iopubMessages[1]).toEqual(text2);
      }));

      it("should resolve with the execute results", inject(function(ipyKernel, ipyMessage, ipyMessageHandler){
        var executeResult;
        promise.then(function(result){
          executeResult = result;
        });
        var response = ipyMessage.makeExecuteReply('ok', 1, {}, []);
        ipyMessageHandler.resolve(response);

        var out = {'text/plain': 'the output'};
        var outMessage = ipyMessage.makeExecuteResult(out, 1, {}, sentHeader);
        ipyMessageHandler.iopubHandler(outMessage);

        var display = {'image/png': 'arbitrarypng'};
        var displayMessage = ipyMessage.makeIopubDisplay(display, sentHeader);
        ipyMessageHandler.iopubHandler(displayMessage);
        $rootScope.$apply();

        expect(executeResult.text).toEqual(out['text/plain']);
        expect(executeResult['image/png']).toEqual(display['image/png']);
      }));

      it("should send input_reply messages for stdin requests",
        inject(function(ipyKernel, ipyMessage, ipyMessageHandler){
          var firstResult, secondResult, thirdResult;
          var firstRequest = 'What do you get when you multiply 6 by 9?';
          var firstResponse = '42';
          var secondRequest = 'Would it save you lots of time if I just gave up and went mad now?';
          var secondResponse = "Don't panic";
          var executeResult = 'So long and thanks for all the fish.';
          promise
            .then(function(result){
              firstResult = result;
              return result.reply(firstResponse);
            })
            .then(function(result){
              secondResult = result;
              return result.reply(secondResponse);
            })
            .then(function(result){
              thirdResult = result;
            });

          var response;
          ipyMessageHandler.stdinHandler(ipyMessage.makeInputRequest(firstRequest, null, sentHeader))
            .then(function(stdinResponse){
              response = stdinResponse;
            });
          $rootScope.$apply();
          expect(firstResult.isRequest).toBeTruthy();
          expect(firstResult.prompt).toEqual(firstRequest);
          expect(response).toEqual(firstResponse);

          ipyMessageHandler.stdinHandler(ipyMessage.makeInputRequest(secondRequest, null, sentHeader))
            .then(function(stdinResponse){
              response = stdinResponse;
            });
          $rootScope.$apply();
          expect(secondResult.isRequest).toBeTruthy();
          expect(secondResult.prompt).toEqual(secondRequest);
          expect(response).toEqual(secondResponse);


          var resultMessage = ipyMessage.makeExecuteResult({'text/plain': executeResult}, 1, {}, sentHeader);
          ipyMessageHandler.iopubHandler(resultMessage);
          ipyMessageHandler.resolve(ipyMessage.makeExecuteReply('ok', 1, []));
          $rootScope.$apply();
          expect(thirdResult.text).toEqual(executeResult);
        }));

      it("should pass appropriate options to the execute request",
        inject(function (ipyKernel, ipyMessage, ipyMessageHandler) {
          ipyKernel.execute(kernel1Id, 'some code', true, true, true);
          $rootScope.$apply();
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
          $rootScope.$apply();
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
          $rootScope.$apply();
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
          $rootScope.$apply();
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
          $rootScope.$apply();
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
          $rootScope.$apply();
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
          $rootScope.$apply();
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