describe("ipyWebsocketHandler", function() {
  beforeEach(module('ipyng.websocket'));
  beforeEach(module('ipyng.utils'));
  beforeEach(module('ipyng.messageHandler'));


  var websocketMock = function($timeout) {
    var ws = function (url) {
      this.url = url;
      this.initialized = false;
      this.send = function (message) {
        if(!this.initialized) throw "Websocket not yet initialized!";
        lastSent = message;
      };
      this.onopen = function () {
      };

      websockets.push(this);
      var _this = this;
      $timeout(function () {
        _this.initialized = true;
        _this.onopen();
      }, 50);
    };
    return ws;
  };

  var websockets = [];
  var lastSent;
  beforeEach(module(function($provide) {
    websockets = [];
    lastSent = '';
    $provide.factory("ipyWebsocket", websocketMock);
  }));

  it("should create a websocket with given url", inject(function(ipyWebsocketHandler, $rootScope, $timeout) {
    ipyWebsocketHandler.getOrCreate("someUrl");
    expect(websockets[0].url).toEqual("someUrl");
    ipyWebsocketHandler.getOrCreate("someOtherUrl");
    expect(websockets[1].url).toEqual("someOtherUrl");
    var ws = ipyWebsocketHandler.getOrCreate("someUrl");
    var websocket;
    ws.websocket.then(function(_websocket){
      websocket = _websocket;
    });
    $timeout.flush(50);
    $rootScope.$apply();
    expect(websocket).toBe(websockets[0]);
    expect(websockets.length).toEqual(2);
  }));

  it("should call websocket send", inject(function(ipyWebsocketHandler, $timeout, $rootScope) {
    ipyWebsocketHandler.send("someUrl", "someMessage");
    $timeout.flush(50);
    $rootScope.$apply();
    expect(lastSent).toEqual("someMessage");
    ipyWebsocketHandler.send("someOtherUrl", "someOtherMessage");
    $timeout.flush(50);
    $rootScope.$apply();
    expect(lastSent).toEqual("someOtherMessage");
    expect(websockets[0].url).toEqual("someUrl");
    expect(websockets[1].url).toEqual("someOtherUrl");
  }));

  it("should call all registered callbacks", inject(function(ipyWebsocketHandler, $timeout, $rootScope) {
    var called1 = "";
    var called2 = "";
    ipyWebsocketHandler.registerOnMessageCallback("someUrl", function(e){
      called1 = e;
    });
    ipyWebsocketHandler.registerOnMessageCallback("someUrl", function(e){
      called2 = "arbitrary";
    });
    var ws = ipyWebsocketHandler.getOrCreate("someUrl");
    ws.websocket.then(function(websocket){
      websocket.onmessage("theMessage");
    });
    $timeout.flush(50);
    $rootScope.$apply();
    expect(called1).toEqual("theMessage");
    expect(called2).toEqual("arbitrary");
  }));
})
;