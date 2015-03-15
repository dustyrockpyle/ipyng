describe("ipyMessageHandler", function() {
  beforeEach(module('ipyng.websocket'));
  beforeEach(module('ipyng.kernel.messageHandler'));

  var websocketHandlerMock = function() {
    var mock = {};

    mock.send = function(url, message){
      mock.messages.push({'url': url, 'message': JSON.parse(message)});
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
    function (ipyMessageHandler, ipyWebsocketHandler) {
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
      expect(ipyWebsocketHandler.messages.pop().message).toEqual(message1);
      var promise2 = ipyMessageHandler.sendShellRequest(kernelID, message2);
      expect(ipyWebsocketHandler.messages.pop().message).toEqual(message2);

      promise1.then(resolve, null, notify);
      var url = ipyMessageHandler.channelUrl(kernelID);

      var iopubMessage = ipyMessage.makeMessage('test3', {}, message1Header, 'iopub');
      ipyWebsocketHandler.callbacks[url](makeEvent(iopubMessage));
      $rootScope.$apply();
      expect(notifications.pop()).toEqual(iopubMessage);

      var stdinMessage = ipyMessage.makeMessage('test4', {}, message1Header, 'stdin');
      ipyWebsocketHandler.callbacks[url](makeEvent(stdinMessage));
      $rootScope.$apply();
      expect(notifications.pop()).toEqual(stdinMessage);

      expect(resolveMessage).toBeNull();
      var shellMessage = ipyMessage.makeMessage('test5', {}, message1Header, 'shell');
      ipyWebsocketHandler.callbacks[url](makeEvent(shellMessage));
      $rootScope.$apply();

      expect(resolveMessage).toBeNull();
      var idleMessage = ipyMessage.makeStatusReply('idle', message1Header);
      ipyWebsocketHandler.callbacks[url](makeEvent(idleMessage));
      $rootScope.$apply();
      expect(notifications.pop()).toEqual(idleMessage);
      expect(resolveMessage).toEqual(shellMessage);
    }
  ));
})
;