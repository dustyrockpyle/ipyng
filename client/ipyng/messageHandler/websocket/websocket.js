angular.module('ipyng.messageHandler.websocket', ['ng.lodash'])
  .factory('ipyWebsocketHandler', function (ipyWebsocket, _, $q) {
    var websocketHandler = {connections: {}};
    var onmessageID = 'onmessageCallbacks';
    var oncloseID = 'oncloseCallbacks';
    var onopenID = 'onopenCallbacks';
    websocketHandler.create = function (url) {
      var ws = {};
      var websocket = new ipyWebsocket(url);
      ws[onmessageID] = {};
      ws[oncloseID] = {};
      ws[onopenID] = {};
      websocket.onmessage = function (event) {
        callAllCallbacks(url, onmessageID, event);
      };
      websocket.onclose = function (event) {
        callAllCallbacks(url, oncloseID, event);
      };
      websocket.onopen = function (event) {
        callAllCallbacks(url, onopenID, event);
      };

      websocketHandler.connections[url] = ws;
      var deferred = $q.defer();
      ws.websocket = deferred.promise;
      websocketHandler.registerCallback(url, onopenID, function(){
        deferred.resolve(websocket);
      });
      websocketHandler.registerCallback(url, oncloseID, function(){
        ws.websocket = $q.reject("Connection closed.");
      });
      return ws;
    };

    websocketHandler.getOrCreate = function (url) {
      var result = websocketHandler.connections[url];
      if (result === undefined) {
        return websocketHandler.create(url);
      }
      return result;
    };

    var callAllCallbacks = function (url, callback_type, event) {
      var callbacks = websocketHandler.connections[url][callback_type];
      _.forEach(callbacks, function(callback){
        callback(event);
      });
    };

    websocketHandler.send = function (url, message) {
      return websocketHandler.getOrCreate(url).websocket
        .then(function (websocket){
          websocket.send(message);
        });
    };

    websocketHandler.unregister = function (url, callback_type, callback_id) {
      delete websocketHandler.getOrCreate(url)[callback_type][callback_id];
    };

    websocketHandler.registerCallback = function (url, callback_type, callback) { //Returns function to unregister callback.
      var callback_id = _.uniqueId();
      websocketHandler.getOrCreate(url)[callback_type][callback_id] = callback;
      return function () {
        websocketHandler.unregister(url, callback_type, callback_id);
      };
    };

    websocketHandler.registerOnMessageCallback = function (url, callback) {
      return websocketHandler.registerCallback(url, onmessageID, callback);
    };
    websocketHandler.registerOnCloseCallback = function (url, callback) {
      return websocketHandler.registerCallback(url, oncloseID, callback);
    };
    websocketHandler.registerOnOpenCallback = function (url, callback) {
      return websocketHandler.registerCallback(url, onopenID, callback);
    };

    return websocketHandler;
  })
  .factory('ipyWebsocket', function () {
    if (typeof(WebSocket) !== 'undefined') {
      return WebSocket;
    } else if (typeof(MozWebSocket) !== 'undefined') {
      return MozWebSocket;
    } else {
      alert('Your browser does not have WebSocket support, please try Chrome, Safari or Firefox ≥ 6. Firefox 4 and 5 are also supported by you have to enable WebSockets in about:config.');
      return null;
    }
  })
;