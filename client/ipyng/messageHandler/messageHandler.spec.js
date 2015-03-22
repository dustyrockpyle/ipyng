describe("ipyMessageHandler", function() {
  beforeEach(module('ipyng.messageHandler.websocket'));
  beforeEach(module('ipyng.messageHandler'));

  var ipyMessage;
  var websocketHandlerMock = function() {
    var mock = {};

    mock.send = function(url, message){
      message = ipyMessage.parseMessage(message);
      mock.messages.push({'url': url, 'message': message});
    };
    mock.registerOnMessageCallback = function(url, callback) {
      mock.callbacks[url] = callback;
    };
    mock.reset = function(){
      mock.messages = [];
      mock.callbacks = {};
    };

    mock.reset();
    return mock;
  };

  var makeEvent = function (data) {
    return {'data': JSON.stringify(data)};
  };

  var notifications = [];
  var notify = function(notification) {
    notifications.push(notification);
  };

  var resolveMessage = null;
  var resolve = function(resolved) {
    resolveMessage = resolved;
  };

  beforeEach(module(function($provide) {
    $provide.factory("ipyWebsocketHandler", websocketHandlerMock);
    notifications = [];
    resolveMessage = null;
  }));

  it("should register the channel callback", inject(
    function (ipyMessageHandler, ipyWebsocketHandler, _ipyMessage_) {
      ipyMessage = _ipyMessage_;
      ipyWebsocketHandler.reset();
      ipyMessageHandler.registerChannel("1");
      expect(Object.keys(ipyWebsocketHandler.callbacks).length).toEqual(1);
    }
  ));

  // Should probably break this test up...
  it("should send a message, return a promise, notify and resolve that promise", inject(
    function (ipyMessageHandler, ipyWebsocketHandler, ipyMessage, $rootScope) {
      var kernelID = "1";
      ipyMessageHandler.registerChannel(kernelID);
      var message1 = ipyMessage.makeMessage("test1");
      var message1Header = ipyMessage.getHeader(message1);
      var message2 = ipyMessage.makeMessage("test2");
      var message2Header = ipyMessage.getHeader(message2);
      var promise1 = ipyMessageHandler.sendShellRequest(kernelID, message1);
      expect(ipyMessage.getHeader(ipyWebsocketHandler.messages.pop().message)).toEqual(message1Header);
      var promise2 = ipyMessageHandler.sendShellRequest(kernelID, message2);
      expect(ipyMessage.getHeader(ipyWebsocketHandler.messages.pop().message)).toEqual(message2Header);

      promise1.then(resolve, null, notify);
      var url = ipyMessageHandler.channelUrl(kernelID);

      var iopubMessage = ipyMessage.makeMessage('test3', {}, message1Header, 'iopub');
      var iopubHeader = ipyMessage.getHeader(iopubMessage);
      ipyWebsocketHandler.callbacks[url](makeEvent(iopubMessage));
      $rootScope.$apply();
      expect(ipyMessage.getHeader(notifications.pop())).toEqual(iopubHeader);

      var stdinMessage = ipyMessage.makeMessage('test4', {}, message1Header, 'stdin');
      var stdinHeader = ipyMessage.getHeader(stdinMessage);
      ipyWebsocketHandler.callbacks[url](makeEvent(stdinMessage));
      $rootScope.$apply();
      expect(ipyMessage.getHeader(notifications.pop())).toEqual(stdinHeader);

      expect(resolveMessage).toBeNull();
      var shellMessage = ipyMessage.makeMessage('test5', {}, message1Header, 'shell');
      var shellHeader = ipyMessage.getHeader(shellMessage);
      ipyWebsocketHandler.callbacks[url](makeEvent(shellMessage));
      $rootScope.$apply();

      expect(resolveMessage).toBeNull();
      var idleMessage = ipyMessage.makeStatusReply('idle', message1Header);
      var idleHeader = ipyMessage.getHeader(idleMessage);
      ipyWebsocketHandler.callbacks[url](makeEvent(idleMessage));
      $rootScope.$apply();
      expect(ipyMessage.getHeader(notifications.pop())).toEqual(idleHeader);
      expect(ipyMessage.getHeader(resolveMessage)).toEqual(shellHeader);
    }
  ));
})
;