describe("ipyng.messageHandler", function() {
    beforeEach(module('ipyng.websocket'));
    beforeEach(module('ipyng.utils'));
    beforeEach(module('ipyng.messageHandler'));

    describe("ipyWebsocketHandler", function() {

        var websocketMock = function() {
            return function(url) {
                var ws = {
                    url: url,
                    send: function (message) {
                        lastSent = message;
                    }
                };
                websockets.push(ws);
                return ws;
            };
        };

        var websockets = [];
        var lastSent;
        beforeEach(module(function($provide) {
            websockets = [];
            lastSent = '';
            $provide.factory("ipyWebsocket", websocketMock);
        }));

        it("should create a websocket with given url", inject(function(ipyWebsocketHandler) {
            ipyWebsocketHandler.getOrCreate("someUrl");
            expect(websockets[0].url).toEqual("someUrl");
            ipyWebsocketHandler.getOrCreate("someOtherUrl");
            expect(websockets[1].url).toEqual("someOtherUrl");
            var ws = ipyWebsocketHandler.getOrCreate("someUrl");
            expect(ws.websocket).toBe(websockets[0]);
            expect(websockets.length).toEqual(2);
        }));

        it("should call websocket send", inject(function(ipyWebsocketHandler) {
            ipyWebsocketHandler.send("someUrl", "someMessage");
            expect(lastSent).toEqual("someMessage");
            ipyWebsocketHandler.send("someOtherUrl", "someOtherMessage");
            expect(lastSent).toEqual("someOtherMessage");
            expect(websockets[0].url).toEqual("someUrl");
            expect(websockets[1].url).toEqual("someOtherUrl");
        }));

        it("should call all registered callbacks", inject(function(ipyWebsocketHandler) {
            var called1 = "";
            var called2 = "";
            ipyWebsocketHandler.registerOnMessageCallback("someUrl", function(e){
                called1 = e;
            });
            ipyWebsocketHandler.registerOnMessageCallback("someUrl", function(e){
                called2 = "arbitrary";
            });
            var ws = ipyWebsocketHandler.getOrCreate("someUrl");
            ws.websocket.onmessage("theMessage");
            expect(called1).toEqual("theMessage");
            expect(called2).toEqual("arbitrary");
        }));
    });
})
;