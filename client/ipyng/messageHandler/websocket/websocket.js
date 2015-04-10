(function(angular){
  'use strict';

  angular.module('ipyng.messageHandler.websocket', ['ng.lodash'])
    .factory('$ipyWebsocketHandler', ipyWebsocketHandlerFactory)
    .factory('$ipyWebsocket', ipyWebsocketFactory);

  function ipyWebsocketHandlerFactory ($ipyWebsocket, _, $q) {
    var onmessageId = 'onmessageCallbacks';
    var oncloseId = 'oncloseCallbacks';
    var onopenId = 'onopenCallbacks';

    var $ipyWebsocketHandler = {
      connections: {},
      create: create,
      getOrCreate: getOrCreate,
      send: send,
      unregister: unregister,
      registerCallback: registerCallback,
      registerOnMessageCallback: registerOnMessageCallback,
      registerOnCloseCallback: registerOnCloseCallback,
      registerOnOpenCallback: registerOnOpenCallback
    };

    return $ipyWebsocketHandler;

    function create (url) {
      var ws = {};
      var websocket = new $ipyWebsocket(url);
      ws[onmessageId] = {};
      ws[oncloseId] = {};
      ws[onopenId] = {};
      websocket.onmessage = function (event) {
        callAllCallbacks(url, onmessageId, event);
      };
      websocket.onclose = function (event) {
        callAllCallbacks(url, oncloseId, event);
      };
      websocket.onopen = function (event) {
        callAllCallbacks(url, onopenId, event);
      };

      $ipyWebsocketHandler.connections[url] = ws;
      var deferred = $q.defer();
      ws.websocket = deferred.promise;
      $ipyWebsocketHandler.registerCallback(url, onopenId, function(){
        deferred.resolve(websocket);
      });
      $ipyWebsocketHandler.registerCallback(url, oncloseId, function(){
        ws.websocket = $q.reject("Connection closed.");
      });
      return ws;
    }

    function getOrCreate (url) {
      var result = $ipyWebsocketHandler.connections[url];
      if (result === undefined) {
        return $ipyWebsocketHandler.create(url);
      }
      return result;
    }

    function callAllCallbacks (url, callback_type, event) {
      var callbacks = $ipyWebsocketHandler.connections[url][callback_type];
      _.forEach(callbacks, function(callback){
        callback(event, url);
      });
    }

    function send (url, message) {
      return $ipyWebsocketHandler.getOrCreate(url).websocket
        .then(function (websocket){
          websocket.send(message);
        });
    }

    function unregister (url, callback_type, callback_id) {
      delete $ipyWebsocketHandler.getOrCreate(url)[callback_type][callback_id];
    }

    function registerCallback (url, callback_type, callback) { //Returns function to unregister callback.
      var callback_id = _.uniqueId();
      $ipyWebsocketHandler.getOrCreate(url)[callback_type][callback_id] = callback;
      return function () {
        $ipyWebsocketHandler.unregister(url, callback_type, callback_id);
      };
    }

    function registerOnMessageCallback (url, callback) {
      return $ipyWebsocketHandler.registerCallback(url, onmessageId, callback);
    }

    function registerOnCloseCallback (url, callback) {
      return $ipyWebsocketHandler.registerCallback(url, oncloseId, callback);
    }

    function registerOnOpenCallback (url, callback) {
      return $ipyWebsocketHandler.registerCallback(url, onopenId, callback);
    }
  }

  function ipyWebsocketFactory () {
    if (typeof(WebSocket) !== 'undefined') {
      return WebSocket;
    } else if (typeof(MozWebSocket) !== 'undefined') {
      return MozWebSocket;
    } else {
      alert('Your browser does not have WebSocket support, please try Chrome, Safari or Firefox ≥ 6. Firefox 4 and 5 are also supported by you have to enable WebSockets in about:config.');
      return null;
    }
  }
})(angular);