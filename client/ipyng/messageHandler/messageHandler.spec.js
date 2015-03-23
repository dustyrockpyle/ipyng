describe("ipyMessageHandler", function() {
  beforeEach(module('ipyng.messageHandler.websocket'));
  beforeEach(module('ipyng.messageHandler'));

  var ipyMessage;
  var $rootScope;
  var ipyWebsocketHandler;
  var ipyMessageHandler;

  var websocketHandlerMock = function() {
    var mock = {};

    mock.send = function(url, message){
      message = ipyMessage.parseMessage(message, kernelId);
      mock.messages.push({'url': url, 'message': message});
    };
    mock.registerOnMessageCallback = function(url, callback) {
      mock.callbacks[url] = callback;
    };
    mock.reset = function(){
      mock.messages = [];
      mock.callbacks = {};
    };

    mock.onmessage = function(url, message) {
      mock.callbacks[url]({data: ipyMessage.stringifyMessage(message)}, url);
    };

    mock.reset();
    return mock;
  };

  var stdoutMessages = [];
  var stdoutHandler = function(message) {
    stdoutMessages.push(message);
  };

  var stdinResponse;
  var stdinMessages = [];
  var stdinHandler = function(message) {
    stdinMessages.push(message);
    return ipyMessage.makeInputReply(stdinResponse, ipyMessage.getHeader(message));
  };

  var resolveMessage = null;
  var resolve = function(resolved) {
    resolveMessage = resolved;
  };

  beforeEach(module(function($provide) {
    $provide.factory("ipyWebsocketHandler", websocketHandlerMock);
  }));

  var kernelId = "1";
  var message1;
  var message1Header;
  var message2;
  var message2Header;
  var promise1;
  var promise2;
  var url;

  beforeEach(inject(function (_ipyMessage_, _$rootScope_, _ipyWebsocketHandler_, _ipyMessageHandler_) {
    ipyMessage = _ipyMessage_;
    $rootScope = _$rootScope_;
    ipyWebsocketHandler = _ipyWebsocketHandler_;
    ipyMessageHandler = _ipyMessageHandler_;

    stdoutMessages = [];
    stdinMessages = [];
    resolveMessage = null;

    ipyMessageHandler.registerChannel(kernelId);
    message1 = ipyMessage.makeMessage("test1");
    message1Header = ipyMessage.getHeader(message1);
    message2 = ipyMessage.makeMessage("test2");
    message2Header = ipyMessage.getHeader(message2);
    promise1 = ipyMessageHandler.sendShellRequest(kernelId, message1, stdoutHandler, stdinHandler);
    promise2 = ipyMessageHandler.sendShellRequest(kernelId, message2, stdoutHandler, stdinHandler);
    $rootScope.$apply();
    url = ipyMessageHandler.channelUrl(kernelId);
  }));

  it("should register the channel callback", function () {
    expect(_.keys(ipyWebsocketHandler.callbacks).length).toEqual(1);
  });

  describe("sendShellRequest", function(){
    it("should send a message through the websocketHandler", function() {
      expect(ipyMessage.getHeader(ipyWebsocketHandler.messages.pop().message)).toEqual(message2Header);
      expect(ipyMessage.getHeader(ipyWebsocketHandler.messages.pop().message)).toEqual(message1Header);
    });

    it("should resolve the shell request with the result after idle and shell replies", function() {
      promise2.then(resolve);
      expect(resolveMessage).toBeNull();
      var response = ipyMessage.makeExecuteReply('ok', 1, [], null, message2Header);
      var responseHeader = ipyMessage.getHeader(response);
      ipyWebsocketHandler.onmessage(url, response);
      $rootScope.$apply();
      expect(resolveMessage).toBeNull();
      var idleMessage = ipyMessage.makeStatusReply('idle', message2Header);
      var idleHeader = ipyMessage.getHeader(idleMessage);
      ipyWebsocketHandler.onmessage(url, idleMessage);
      $rootScope.$apply();
      expect(ipyMessage.getHeader(stdoutMessages[0])).toEqual(idleHeader);
      expect(ipyMessage.getParentHeader(resolveMessage)).toEqual(message2Header);
    });

    it("should call the iopub handler for each iopub message", function() {
      var iopubMessage = ipyMessage.makeMessage('test3', {}, message1Header, 'iopub');
      var iopubHeader = ipyMessage.getHeader(iopubMessage);
      ipyWebsocketHandler.onmessage(url, iopubMessage);
      $rootScope.$apply();
      expect(ipyMessage.getHeader(stdoutMessages.pop())).toEqual(iopubHeader);
      iopubMessage = ipyMessage.makeMessage('test4', {}, message1Header, 'iopub');
      iopubHeader = ipyMessage.getHeader(iopubMessage);
      ipyWebsocketHandler.onmessage(url, iopubMessage);
      $rootScope.$apply();
      expect(ipyMessage.getHeader(stdoutMessages.pop())).toEqual(iopubHeader);
    });

    it("should call the stdin handler for each stdin request", function(){
      var stdinMessage = ipyMessage.makeInputRequest('input', '', message1Header);
      var stdinHeader = ipyMessage.getHeader(stdinMessage);
      stdinResponse = 'test6';
      ipyWebsocketHandler.onmessage(url, stdinMessage);
      $rootScope.$apply();
      expect(ipyMessage.getHeader(stdinMessages.pop())).toEqual(stdinHeader);
      expect(ipyMessage.getContent(ipyWebsocketHandler.messages.pop().message).value).toEqual(stdinResponse);
    });
  });
});