describe("ipyng.messageHandler", function() {
    beforeEach(module('ipyng.websocket'));
    beforeEach(module('ipyng.messageHandler'));

    describe("ipyMessageHandler", function() {

        var websocketHandlerMock = function() {
            var mock = {};

            mock.send = function(url, message){
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
            return {'data': data};
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

        it("should send session info and register callbacks to iopub/shell/stdin", inject(
            function (ipyMessageHandler, ipyWebsocketHandler) {
                ipyWebsocketHandler.reset();
                ipyMessageHandler.sendConnectRequest("1");
                expect(ipyWebsocketHandler.messages.length).toEqual(3);
                expect(Object.keys(ipyWebsocketHandler.callbacks).length).toEqual(3);
            }
        ));

        // Should probably break this test up...
        it("should send a message, return a promise, notify and resolve that promise", inject(
            function (ipyMessageHandler, ipyWebsocketHandler, ipyMessage, $rootScope) {
                var kernelID = "1";
                ipyMessageHandler.sendConnectRequest(kernelID);
                var message1 = ipyMessage.makeMessage("test1");
                var message1Header = ipyMessage.getHeader(message1);
                var message2 = ipyMessage.makeMessage("test2");
                var message2Header = ipyMessage.getHeader(message2);
                var promise1 = ipyMessageHandler.sendShellRequest(kernelID, message1);
                expect(ipyWebsocketHandler.messages.pop().message).toEqual(JSON.stringify(message1));
                var promise2 = ipyMessageHandler.sendShellRequest(kernelID, message2);
                expect(ipyWebsocketHandler.messages.pop().message).toEqual(JSON.stringify(message2));

                promise1.then(resolve, null, notify);
                var shellUrl = ipyMessageHandler.shellUrl(kernelID);
                var iopubUrl = ipyMessageHandler.iopubUrl(kernelID);
                var stdinUrl = ipyMessageHandler.stdinUrl(kernelID);

                var iopubMessage = ipyMessage.makeMessage('test3', {}, message1Header);
                ipyWebsocketHandler.callbacks[iopubUrl](makeEvent(iopubMessage));
                $rootScope.$apply();
                expect(notifications.pop()).toEqual(iopubMessage);

                var stdinMessage = ipyMessage.makeMessage('test4', {}, message1Header);
                ipyWebsocketHandler.callbacks[stdinUrl](makeEvent(stdinMessage));
                $rootScope.$apply();
                expect(notifications.pop()).toEqual(stdinMessage);

                expect(resolveMessage).toBeNull();
                var shellMessage = ipyMessage.makeMessage('test5', {}, message1Header);
                ipyWebsocketHandler.callbacks[shellUrl](makeEvent(shellMessage));
                $rootScope.$apply();
                expect(resolveMessage).toEqual(shellMessage);
            }
        ));
    });
})
;